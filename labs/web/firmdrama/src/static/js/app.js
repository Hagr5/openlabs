const RoomReserve = (() => {
  const browserHeaders = (extra = {}) => ({'X-firmdrama-Client': 'browser', ...extra});

  const request = async (path, options = {}) => {
    const response = await fetch(path, {...options, credentials: 'same-origin', headers: browserHeaders(options.headers || {})});
    if (response.status === 401) {
      location.assign('/');
      throw new Error('authentication_required');
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Request failed');
    return payload;
  };

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const showEmpty = (target, message) => target.replaceChildren(element('p', 'muted', message));
  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(value)) : 'Not scheduled';
  const syncNavigation = (me) => document.querySelectorAll('[data-facilities-nav]').forEach((link) => { link.hidden = me.role_id !== 499; });
  const loadMe = async () => {
    const me = await request('/api/v1/me');
    syncNavigation(me);
    return me;
  };
  const setSubmitState = (form, busy, busyLabel) => {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.idleLabel;
    form.setAttribute('aria-busy', String(busy));
  };
  const bindLogout = () => document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try { await request('/api/v1/auth/logout', {method: 'POST'}); } finally { location.assign('/'); }
  });

  const bindLogin = () => document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const error = document.querySelector('#error');
    if (formNode.getAttribute('aria-busy') === 'true') return;
    error.textContent = '';
    setSubmitState(formNode, true, 'Signing in…');
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: browserHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify(Object.fromEntries(new FormData(formNode))),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Sign-in failed.');
      location.assign('/dashboard');
    } catch (loginError) {
      error.textContent = loginError.message;
      setSubmitState(formNode, false, 'Signing in…');
    }
  });

  const bookingMetaItem = (label, value) => {
    const item = element('div', 'booking-meta-item');
    item.append(element('dt', '', label), element('dd', '', value));
    return item;
  };

  const bookingCard = (booking, {compact = false, me = null, onCancel = null} = {}) => {
    const card = element('article', 'booking');
    const details = element('div', 'booking-main');
    details.append(element('strong', '', booking.room_name), element('p', 'booking-purpose', booking.purpose));
    const metadata = element('dl', compact ? 'booking-meta compact' : 'booking-meta');
    metadata.append(
      bookingMetaItem('Reserved by', booking.reserved_by),
      bookingMetaItem('Matter', booking.matter_code),
      bookingMetaItem('Confidentiality', booking.confidentiality),
    );
    if (!compact) {
      metadata.append(
        bookingMetaItem('Starts', formatDate(booking.starts_at)),
        bookingMetaItem('Ends', formatDate(booking.ends_at)),
        bookingMetaItem('Status', booking.status),
      );
    }
    details.append(metadata);
    const actions = element('div', 'booking-actions');
    if (compact) actions.append(element('small', '', formatDate(booking.starts_at)));
    if (me && booking.reserved_by === me.display_name && booking.status === 'confirmed' && onCancel) {
      const cancel = element('button', 'secondary-button', 'Cancel booking');
      cancel.type = 'button';
      cancel.addEventListener('click', () => onCancel(booking, cancel));
      actions.append(cancel);
    }
    card.append(details, actions);
    return card;
  };

  const initDashboard = async () => {
    bindLogout();
    const target = document.querySelector('#booking-list');
    try {
      const [me, calendar] = await Promise.all([loadMe(), request('/api/v1/bookings/calendar')]);
      document.querySelector('[data-user-name]').textContent = me.display_name;
      document.querySelector('[data-user-role]').textContent = me.role_name;
      document.querySelector('[data-user-department]').textContent = me.department;
      document.querySelector('[data-user-access]').textContent = me.role_id === 499 ? 'Managing' : 'Standard';
      const confirmed = calendar.bookings.filter((booking) => booking.status === 'confirmed');
      document.querySelector('[data-booking-count]').textContent = String(confirmed.length);
      const cards = confirmed.slice(0, 3).map((booking) => bookingCard(booking, {compact: true}));
      target.replaceChildren(...cards);
      if (!cards.length) showEmpty(target, 'No upcoming bookings.');
    } catch (error) { showEmpty(target, error.message); }
  };

  const initCalendar = async () => {
    bindLogout();
    const target = document.querySelector('#calendar-list');
    const history = document.querySelector('#calendar-history');
    try {
      const [me, calendar] = await Promise.all([loadMe(), request('/api/v1/bookings/calendar')]);
      const cancelBooking = async (booking, button) => {
        button.disabled = true;
        try {
          await request(`/api/v1/bookings/${encodeURIComponent(booking.booking_id)}`, {method: 'DELETE'});
          await initCalendar();
        } catch (error) { button.disabled = false; button.textContent = error.message; }
      };
      // The seeded schedule is a working-day view. Keep active reservations
      // together so occupied-room context remains visible regardless of clock time.
      const upcoming = calendar.bookings.filter((booking) => booking.status !== 'cancelled');
      const past = calendar.bookings.filter((booking) => booking.status === 'cancelled');
      const upcomingCards = upcoming.map((booking) => bookingCard(booking, {me, onCancel: cancelBooking}));
      const pastCards = past.map((booking) => bookingCard(booking));
      target.replaceChildren(...upcomingCards);
      history.replaceChildren(...pastCards);
      if (!upcomingCards.length) showEmpty(target, 'No upcoming bookings.');
      if (!pastCards.length) showEmpty(history, 'No past bookings.');
    } catch (error) { showEmpty(target, error.message); showEmpty(history, error.message); }
  };

  const initRooms = async () => {
    bindLogout();
    const target = document.querySelector('#room-list');
    const select = document.querySelector('#booking-room');
    const form = document.querySelector('#booking-form');
    const status = document.querySelector('#booking-status');
    try {
      const [, data] = await Promise.all([loadMe(), request('/api/v1/rooms')]);
      const rooms = data.rooms;
      const cards = rooms.map((room) => {
        const card = element('article', 'booking');
        const details = element('div');
        details.append(element('strong', '', room.name), element('small', '', `Floor ${room.floor} · Capacity ${room.capacity}`));
        card.append(details, element('small', '', `${room.confidentiality_level} · ${room.status}`));
        return card;
      });
      target.replaceChildren(...cards);
      if (!cards.length) showEmpty(target, 'No rooms are currently listed.');
      select.replaceChildren(element('option', '', 'Choose an available room'));
      select.firstChild.value = '';
      rooms.filter((room) => room.status === 'available').forEach((room) => {
        const option = element('option', '', `${room.name} · Floor ${room.floor}`);
        option.value = String(room.id);
        select.append(option);
      });
      if (select.options.length === 1) select.disabled = true;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (form.getAttribute('aria-busy') === 'true') return;
        const values = Object.fromEntries(new FormData(form));
        status.textContent = '';
        setSubmitState(form, true, 'Confirming…');
        try {
          await request('/api/v1/bookings', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...values, room_id: Number(values.room_id), starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString()}),
          });
          location.assign('/calendar');
        } catch (error) { status.textContent = error.message; setSubmitState(form, false, 'Confirming…'); }
      });
    } catch (error) { showEmpty(target, error.message); select.disabled = true; status.textContent = error.message; }
  };

  const conversationIdForPage = () => location.pathname.split('/').filter(Boolean).at(-1);

  const initConversations = async () => {
    bindLogout();
    const target = document.querySelector('#conversation-list');
    try {
      const me = await loadMe();
      const data = await request(`/api/v1/dashboards/${encodeURIComponent(me.dashboard_id)}/conversations`);
      const cards = data.conversations.map((conversation) => {
        const card = element('a', 'conversation');
        card.href = `/conversations/${encodeURIComponent(conversation.conversation_id)}`;
        const details = element('div');
        details.append(element('strong', '', conversation.subject), element('small', '', conversation.participants.join(' · ')));
        card.append(details, element('small', '', `${conversation.message_count} messages`));
        return card;
      });
      target.replaceChildren(...cards);
      if (!cards.length) showEmpty(target, 'No recent conversations.');
    } catch (error) { showEmpty(target, error.message); }
  };

  const initConversationDetail = async () => {
    bindLogout();
    const target = document.querySelector('#message-list');
    try {
      const me = await loadMe();
      const conversationId = conversationIdForPage();
      const data = await request(`/api/v1/dashboards/${encodeURIComponent(me.dashboard_id)}/conversations/${encodeURIComponent(conversationId)}`);
      document.querySelector('#conversation-title').textContent = data.subject;
      document.querySelector('#conversation-meta').textContent = `${data.participants.map((participant) => participant.display_name).join(' · ')} · ${data.messages.length} messages`;
      const cards = data.messages.map((message) => {
        const card = element('article', 'conversation');
        const details = element('div');
        details.append(element('strong', '', message.sender), element('small', '', message.body_preview));
        card.append(details, element('small', '', formatDate(message.created_at)));
        return card;
      });
      target.replaceChildren(...cards);
      if (!cards.length) showEmpty(target, 'No messages are available.');
    } catch (error) { showEmpty(target, error.message); }
  };

  const initProfile = async () => {
    bindLogout();
    const profileForm = document.querySelector('#profile-form');
    const profileStatus = document.querySelector('#profile-status');
    try {
      let me = await loadMe();
      document.querySelector('#profile-display-name').value = me.display_name;
      document.querySelector('#profile-department').value = me.department || '';
      document.querySelector('#profile-phone-extension').value = me.phone_extension || '';
      const update = async (form, payload, status, busyLabel) => {
        if (form.getAttribute('aria-busy') === 'true') return null;
        status.textContent = '';
        setSubmitState(form, true, busyLabel);
        try {
          const updated = await request(`/api/v1/users/${encodeURIComponent(me.id)}/profile`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
          status.textContent = 'Saved.';
          syncNavigation(updated);
          me = updated;
          setSubmitState(form, false, busyLabel);
          return updated;
        } catch (error) { status.textContent = error.message; setSubmitState(form, false, busyLabel); return null; }
      };
      profileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await update(profileForm, {
          ...Object.fromEntries(new FormData(profileForm)),
          role_id: me.role_id,
          delegation_approval_id: 'NULL',
        }, profileStatus, 'Saving…');
      });
    } catch (error) { profileStatus.textContent = error.message; }
  };

  const initFacilities = async () => {
    bindLogout();
    const target = document.querySelector('#facilities-content');
    try {
      const me = await loadMe();
      if (me.role_id !== 499) { location.replace('/dashboard'); return; }
      const data = await request('/api/v3/dashboard');
      const panel = element('article', 'panel');
      const ticket = element('div', 'ticket-card');
      ticket.append(element('h2', '', data.ticket.title), element('p', 'ticket-status', `Status: ${data.ticket.status}`), element('p', 'muted', 'Secure ticket preview available through the Facilities Desk.'));
      panel.append(element('p', 'eyebrow', data.dashboard), ticket);
      target.replaceChildren(panel);
    } catch (error) { showEmpty(target, error.message); }
  };

  const initRequests = async () => {
    bindLogout();
    const target = document.querySelector('#request-list');
    try {
      await loadMe();
      const data = await request('/api/v1/maintenance-requests');
      const cards = data.requests.map((item) => {
        const card = element('article', 'conversation');
        const details = element('div');
        details.append(element('strong', '', item.title), element('small', '', `Submitted ${formatDate(item.created_at)}`));
        card.append(details, element('small', '', item.status));
        return card;
      });
      target.replaceChildren(...cards);
      if (!cards.length) showEmpty(target, 'You have no Facilities requests.');
    } catch (error) { showEmpty(target, error.message); }
  };

  const initNotifications = async () => {
    bindLogout();
    const target = document.querySelector('#notification-list');
    try {
      await loadMe();
      const data = await request('/api/v1/notifications');
      const cards = data.notifications.map((item) => {
        const card = element('article', 'conversation');
        const details = element('div');
        details.append(element('strong', '', item.title), element('small', '', item.detail));
        card.append(details, element('small', '', item.kind));
        return card;
      });
      target.replaceChildren(...cards);
      if (!cards.length) showEmpty(target, 'No new notifications.');
    } catch (error) { showEmpty(target, error.message); }
  };

  const initializers = {
    login: bindLogin, dashboard: initDashboard, calendar: initCalendar, rooms: initRooms,
    conversations: initConversations, conversation: initConversationDetail, profile: initProfile, facilities: initFacilities,
    requests: initRequests, notifications: initNotifications,
  };
  const initialize = () => initializers[document.body.dataset.page]?.();
  return {initialize};
})();

document.addEventListener('DOMContentLoaded', RoomReserve.initialize);
