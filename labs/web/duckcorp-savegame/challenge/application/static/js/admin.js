window.onload = () => {
    loadProfile('muhammadibn3bdullah');
}

const loadProfile = async (id) => {

    $('#profile-editor').val('');
    $('#update-resp').hide();

    await fetch(`/profiles/${id}`, {
        method: 'GET'
    })
    .then(async (response) => {
        if (response.status == 200) {
            profile = await response.text();
            $('#profile-editor').val(profile);
            $('#profile-id').val(id);
        }
        else {
            $('#update-resp').text('Failed to load profile data!');
            $('#update-resp').show();
        }
    })
    .catch((error) => {
        $('#update-resp').text('Something went wrong!');
        $('#update-resp').show();
    });
}

const updateProfile = async () => {

    let profileID = $('#profile-id').val();
    let profileData = $('#profile-editor').val();


    await fetch(`/profiles/${profileID}/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({profileData}),
    })
    .then(res => res.json())
    .then(res => {
        $('#update-resp').text(res.message);
        $('#update-resp').show();
    })
    .catch((error) => {
        $('#update-resp').val('Something went wrong!');
        $('#update-resp').show();
    });
}

const importProfile = async () => {

    profileURL = $('#profile-url').val();

    await fetch('/profiles/import', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({profileURL}),
    })
    .then(res => res.json())
    .then(res => {
        $('#import-resp').text(res.message);
        $('#import-resp').show();
    })
    .catch((error) => {
        $('#import-resp').val('Something went wrong!');
        $('#import-resp').show();
    });
}