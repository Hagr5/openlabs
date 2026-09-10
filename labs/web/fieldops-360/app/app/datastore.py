import csv
import hashlib
import hmac
import io
import secrets
import threading
import time


def _hash_password(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)


TENANTS = {
    "acme-hvac": {"name": "ACME Climate Control", "region": "Southwest"},
    "brightspark-electrical": {"name": "BrightSpark Electrical", "region": "Northern"},
    "cascade-plumbing": {"name": "Cascade Plumbing Group", "region": "Pacific"},
}

USERS = [
    {
        "username": "demo@acme-hvac.example",
        "display_name": "Sam Ortiz",
        "tenant": "acme-hvac",
        "role": "Technician",
        "account_type": "Tenant",
        "password": "Demo1234!",
        "sso_only": False,
    },
    {
        "username": "admin@fieldops.internal",
        "display_name": "Platform Administrator",
        "tenant": None,
        "role": "PlatformAdmin",
        "account_type": "Admin",
        "password": None,
        "sso_only": True,
    },
]

TECHNICIANS = [
    {"id": "TECH-0101", "name": "Luis Ferreira", "phone": "(602) 555-0143", "email": "luis.ferreira@acme-hvac.example", "company": "acme-hvac", "region": "Phoenix Metro", "skills": "HVAC Install, Refrigeration"},
    {"id": "TECH-0102", "name": "Priya Nair", "phone": "(602) 555-0177", "email": "priya.nair@acme-hvac.example", "company": "acme-hvac", "region": "East Valley", "skills": "Furnace, Heat Pumps"},
    {"id": "TECH-0103", "name": "Ana Beltran", "phone": "(480) 555-0129", "email": "ana.beltran@acme-hvac.example", "company": "acme-hvac", "region": "Scottsdale", "skills": "Ducting, Thermostats"},
    {"id": "TECH-0104", "name": "Marcus Hale", "phone": "(602) 555-0116", "email": "marcus.hale@acme-hvac.example", "company": "acme-hvac", "region": "Phoenix Metro", "skills": "Supervisor, QA"},
    {"id": "TECH-0201", "name": "Dele Okafor", "phone": "(312) 555-0182", "email": "d.okafor@brightspark.example", "company": "brightspark-electrical", "region": "Chicago North", "skills": "Panel Upgrades, EV Chargers"},
    {"id": "TECH-0202", "name": "Jenny Wu", "phone": "(312) 555-0159", "email": "j.wu@brightspark.example", "company": "brightspark-electrical", "region": "Loop", "skills": "Lighting Retrofits"},
    {"id": "TECH-0203", "name": "Tomas Lindqvist", "phone": "(773) 555-0134", "email": "t.lindqvist@brightspark.example", "company": "brightspark-electrical", "region": "West Side", "skills": "Generators"},
    {"id": "TECH-0204", "name": "Rachel Adebayo", "phone": "(773) 555-0168", "email": "r.adebayo@brightspark.example", "company": "brightspark-electrical", "region": "South Side", "skills": "Inspections, Permitting"},
    {"id": "TECH-0301", "name": "Peter Rivera", "phone": "(206) 555-0148", "email": "p.rivera@cascade-plumbing.example", "company": "cascade-plumbing", "region": "Seattle", "skills": "Repipe, Water Heaters"},
    {"id": "TECH-0302", "name": "Lin Harper", "phone": "(206) 555-0121", "email": "l.harper@cascade-plumbing.example", "company": "cascade-plumbing", "region": "Tacoma", "skills": "Drain, Hydro-Jet"},
    {"id": "TECH-0303", "name": "Nikhil Bose", "phone": "(253) 555-0172", "email": "n.bose@cascade-plumbing.example", "company": "cascade-plumbing", "region": "Kent", "skills": "Backflow, Leak Detection"},
    {"id": "TECH-0304", "name": "Grace Omondi", "phone": "(253) 555-0190", "email": "g.omondi@cascade-plumbing.example", "company": "cascade-plumbing", "region": "Puyallup", "skills": "Service Calls"},
]

JOBS = [
    {"job_id": "JOB-2026-0841", "company": "acme-hvac", "customer": "Margaret Whitfield", "address": "482 Sagebrush Ln, Phoenix AZ 85004", "phone": "(602) 555-0107", "email": "m.whitfield@example.com", "service_type": "A/C Replacement", "priority": "High", "status": "Completed", "scheduled_for": "2026-08-24T09:00", "technician": "Luis Ferreira", "amount_usd": 1840.00, "internal_notes": "Warranty registration mailed 08/26."},
    {"job_id": "JOB-2026-0842", "company": "acme-hvac", "customer": "Margaret Whitfield", "address": "482 Sagebrush Ln, Phoenix AZ 85004", "phone": "(602) 555-0107", "email": "m.whitfield@example.com", "service_type": "Follow-up Inspection", "priority": "Normal", "status": "Completed", "scheduled_for": "2026-08-31T14:00", "technician": "Priya Nair", "amount_usd": 0.00, "internal_notes": "No charge, warranty visit."},
    {"job_id": "JOB-2026-0843", "company": "acme-hvac", "customer": "Derek Boyle", "address": "17 Canyon Ridge Rd, Scottsdale AZ 85254", "phone": "(480) 555-0111", "email": "d.boyle@example.com", "service_type": "Furnace Inspection", "priority": "Normal", "status": "Scheduled", "scheduled_for": "2026-09-12T08:30", "technician": "Priya Nair", "amount_usd": 120.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0844", "company": "acme-hvac", "customer": "Sofia Ramirez", "address": "915 E Coronado St, Tempe AZ 85281", "phone": "(480) 555-0185", "email": "s.ramirez@example.com", "service_type": "Duct Cleaning", "priority": "Normal", "status": "In Progress", "scheduled_for": "2026-09-08T10:00", "technician": "Ana Beltran", "amount_usd": 320.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0845", "company": "acme-hvac", "customer": "Harold Kimura", "address": "77 Mesa Vista Dr, Gilbert AZ 85234", "phone": "(480) 555-0166", "email": "h.kimura@example.com", "service_type": "Heat Pump Repair", "priority": "High", "status": "Scheduled", "scheduled_for": "2026-09-15T07:30", "technician": "Ana Beltran", "amount_usd": 450.00, "internal_notes": "Parts on order, PO-55671."},
    {"job_id": "JOB-2026-0846", "company": "acme-hvac", "customer": "Yolanda Petrov", "address": "230 W Juniper Ave, Mesa AZ 85201", "phone": "(602) 555-0139", "email": "y.petrov@example.com", "service_type": "Maintenance Plan Visit", "priority": "Low", "status": "Completed", "scheduled_for": "2026-09-02T13:00", "technician": "Priya Nair", "amount_usd": 99.00, "internal_notes": "Plan renews 2027-01."},
    {"job_id": "JOB-2026-0847", "company": "acme-hvac", "customer": "Internal - Security Audit", "address": "n/a", "phone": "n/a", "email": "soc@fieldops.internal", "service_type": "SOC Escalation Review", "priority": "Critical", "status": "Closed", "scheduled_for": "2026-09-01T00:00", "technician": "Platform Administrator", "amount_usd": 0.00, "internal_notes": "SOC escalation ESC-2291: third-party pixel abuse confirmed on tenant email gateway. Containment marker {FLAG}. Revoke svc-email-tracker trust and rotate marketing integrations."},
    {"job_id": "JOB-2026-0848", "company": "acme-hvac", "customer": "Terry Osei", "address": "1180 N Stapley Dr, Mesa AZ 85203", "phone": "(602) 555-0198", "email": "t.osei@example.com", "service_type": "Thermostat Install", "priority": "Normal", "status": "Scheduled", "scheduled_for": "2026-09-18T15:00", "technician": "Luis Ferreira", "amount_usd": 210.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0901", "company": "brightspark-electrical", "customer": "Owen Gallagher", "address": "3344 N Sheffield Ave, Chicago IL 60657", "phone": "(773) 555-0152", "email": "o.gallagher@example.org", "service_type": "Panel Upgrade", "priority": "High", "status": "In Progress", "scheduled_for": "2026-09-07T09:00", "technician": "Dele Okafor", "amount_usd": 2650.00, "internal_notes": "Permit 2026-E-4471 approved."},
    {"job_id": "JOB-2026-0902", "company": "brightspark-electrical", "customer": "Amara Diallo", "address": "1545 W Adams St, Chicago IL 60607", "phone": "(312) 555-0163", "email": "a.diallo@example.org", "service_type": "EV Charger Install", "priority": "Normal", "status": "Scheduled", "scheduled_for": "2026-09-14T11:00", "technician": "Dele Okafor", "amount_usd": 1450.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0903", "company": "brightspark-electrical", "customer": "Frank Delvecchio", "address": "2210 N Kedzie Blvd, Chicago IL 60647", "phone": "(773) 555-0109", "email": "f.delvecchio@example.org", "service_type": "Lighting Retrofit", "priority": "Low", "status": "Completed", "scheduled_for": "2026-08-27T08:00", "technician": "Jenny Wu", "amount_usd": 780.00, "internal_notes": "Rebate filed."},
    {"job_id": "JOB-2026-0904", "company": "brightspark-electrical", "customer": "Iris Chen-Mallory", "address": "6120 S Woodlawn Ave, Chicago IL 60637", "phone": "(773) 555-0177", "email": "i.chen@example.org", "service_type": "Generator Maintenance", "priority": "Normal", "status": "Scheduled", "scheduled_for": "2026-09-21T09:30", "technician": "Tomas Lindqvist", "amount_usd": 340.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0905", "company": "brightspark-electrical", "customer": "Ruben Castillo", "address": "8901 S Commercial Ave, Chicago IL 60617", "phone": "(773) 555-0141", "email": "r.castillo@example.org", "service_type": "Safety Inspection", "priority": "Normal", "status": "Completed", "scheduled_for": "2026-09-03T13:30", "technician": "Rachel Adebayo", "amount_usd": 150.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0951", "company": "cascade-plumbing", "customer": "Douglas Whitmore", "address": "4519 Wallingford Ave N, Seattle WA 98103", "phone": "(206) 555-0114", "email": "d.whitmore@example.net", "service_type": "Water Heater Replace", "priority": "High", "status": "Completed", "scheduled_for": "2026-08-29T10:00", "technician": "Peter Rivera", "amount_usd": 1980.00, "internal_notes": "Old unit recycled."},
    {"job_id": "JOB-2026-0952", "company": "cascade-plumbing", "customer": "Elena Vargas", "address": "3318 S 38th St, Tacoma WA 98409", "phone": "(253) 555-0126", "email": "e.vargas@example.net", "service_type": "Drain Hydro-Jet", "priority": "Normal", "status": "In Progress", "scheduled_for": "2026-09-09T08:00", "technician": "Lin Harper", "amount_usd": 420.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0953", "company": "cascade-plumbing", "customer": "George Ainsley", "address": "704 Central Ave N, Kent WA 98032", "phone": "(253) 555-0153", "email": "g.ainsley@example.net", "service_type": "Backflow Certification", "priority": "Normal", "status": "Scheduled", "scheduled_for": "2026-09-16T09:00", "technician": "Nikhil Bose", "amount_usd": 175.00, "internal_notes": "City filing pending."},
    {"job_id": "JOB-2026-0954", "company": "cascade-plumbing", "customer": "Bianca Rossi", "address": "1205 Valley Ave E, Puyallup WA 98372", "phone": "(253) 555-0188", "email": "b.rossi@example.net", "service_type": "Leak Detection", "priority": "High", "status": "Scheduled", "scheduled_for": "2026-09-10T14:00", "technician": "Grace Omondi", "amount_usd": 260.00, "internal_notes": ""},
    {"job_id": "JOB-2026-0955", "company": "cascade-plumbing", "customer": "Samuel Adeyemi", "address": "889 River Rd, Kent WA 98032", "phone": "(253) 555-0102", "email": "s.adeyemi@example.net", "service_type": "Repipe Estimate", "priority": "Low", "status": "Completed", "scheduled_for": "2026-09-04T16:00", "technician": "Peter Rivera", "amount_usd": 0.00, "internal_notes": "Quote Q-8813 sent."},
]

CAMPAIGNS = [
    {"id": "CMP-1001", "company": "acme-hvac", "kind": "invoice", "subject": "Invoice INV-8842 - A/C Replacement", "recipient": "m.whitfield@example.com", "recipient_name": "Margaret Whitfield", "sender": "billing@acme-hvac.example", "ref": "INV-8842", "sent_at": "2026-08-24T09:12", "opened": True, "amount_usd": 1840.00, "body": "Hi Margaret, your invoice INV-8842 for the recent A/C replacement at 482 Sagebrush Ln is now ready. Payment is due within 30 days."},
    {"id": "CMP-1002", "company": "acme-hvac", "kind": "reminder", "subject": "Fall furnace tune-up reminder", "recipient": "d.boyle@example.com", "recipient_name": "Derek Boyle", "sender": "service@acme-hvac.example", "ref": "TUNE-09", "sent_at": "2026-09-02T08:00", "opened": False, "amount_usd": None, "body": "Hi Derek, cooler weather is around the corner. Book your fall furnace tune-up before October 15 and get 15% off the standard inspection price."},
    {"id": "CMP-1003", "company": "acme-hvac", "kind": "invoice", "subject": "Statement STMT-09 - August services", "recipient": "h.kimura@example.com", "recipient_name": "Harold Kimura", "sender": "billing@acme-hvac.example", "ref": "STMT-09", "sent_at": "2026-09-01T07:30", "opened": True, "amount_usd": 99.00, "body": "Hi Harold, your August statement STMT-09 covering the maintenance plan visit on Sep 2 is attached to your account. No payment is due at this time."},
    {"id": "CMP-1004", "company": "acme-hvac", "kind": "notification", "subject": "Your service visit is scheduled", "recipient": "s.ramirez@example.com", "recipient_name": "Sofia Ramirez", "sender": "dispatch@acme-hvac.example", "ref": "JOB-0844", "sent_at": "2026-09-05T10:05", "opened": True, "amount_usd": None, "body": "Hi Sofia, this confirms your duct cleaning appointment on Sep 8 at 10:00 with technician Ana Beltran. Reply to this email or call the office if you need to reschedule."},
    {"id": "CMP-1005", "company": "acme-hvac", "kind": "reminder", "subject": "Maintenance plan renewal", "recipient": "y.petrov@example.com", "recipient_name": "Yolanda Petrov", "sender": "service@acme-hvac.example", "ref": "PLAN-2027", "sent_at": "2026-09-03T14:40", "opened": False, "amount_usd": None, "body": "Hi Yolanda, your Comfort Club maintenance plan renews on January 1. Your card on file will be charged the standard renewal rate unless you cancel before December 15."},
    {"id": "CMP-1006", "company": "acme-hvac", "kind": "newsletter", "subject": "ACME quarterly newsletter", "recipient": "t.osei@example.com", "recipient_name": "Terry Osei", "sender": "hello@acme-hvac.example", "ref": "NEWS-Q3", "sent_at": "2026-09-06T16:00", "opened": False, "amount_usd": None, "body": "Hi Terry, catch up on ACME news: new heat pump rebates, meet our newest technicians, and a maintenance tip for the season change."},
    {"id": "CMP-2001", "company": "brightspark-electrical", "kind": "invoice", "subject": "Quote Q-3312 - Panel Upgrade", "recipient": "o.gallagher@example.org", "recipient_name": "Owen Gallagher", "sender": "office@brightspark.example", "ref": "Q-3312", "sent_at": "2026-09-07T09:20", "opened": True, "amount_usd": 2650.00, "body": "Hi Owen, please find quote Q-3312 for your panel upgrade. The quoted amount includes permit filing and same-day completion."},
    {"id": "CMP-3001", "company": "cascade-plumbing", "kind": "reminder", "subject": "Backflow certification reminder", "recipient": "g.ainsley@example.net", "recipient_name": "George Ainsley", "sender": "office@cascade-plumbing.example", "ref": "CERT-09", "sent_at": "2026-09-04T11:15", "opened": False, "amount_usd": None, "body": "Hi George, your annual backflow certification is due in October. Reply to schedule a convenient window for our technician."},
]

LOGIN_MAX_FAILURES = 8
LOGIN_LOCKOUT_SECONDS = 300
MAX_TRACKING_EVENTS = 5000


class DataStore:
    def __init__(self, flag):
        self._flag = flag
        self._lock = threading.Lock()
        self._users = {}
        for user in USERS:
            record = dict(user)
            if user["password"] is not None:
                salt = secrets.token_bytes(16)
                record["salt"] = salt
                record["password_hash"] = _hash_password(user["password"], salt)
            record.pop("password", None)
            self._users[user["username"]] = record
        self._jobs = []
        for job in JOBS:
            job = dict(job)
            job["internal_notes"] = job["internal_notes"].replace("{FLAG}", flag)
            self._jobs.append(job)
        self._technicians = [dict(t) for t in TECHNICIANS]
        self._tracking_events = []
        self._login_failures = {}

    def get_user(self, username):
        return self._users.get((username or "").strip().lower())

    @staticmethod
    def verify_password(user_record, password):
        if "salt" not in user_record:
            return False
        candidate = _hash_password(password or "", user_record["salt"])
        return hmac.compare_digest(candidate, user_record["password_hash"])

    def login_attempts_locked(self, ip, username):
        key = (ip, (username or "").strip().lower())
        with self._lock:
            record = self._login_failures.get(key)
            if record is None:
                return False
            failures, locked_until = record
            if locked_until and time.time() < locked_until:
                return True
            if locked_until:
                self._login_failures.pop(key, None)
            return False

    def record_login_failure(self, ip, username):
        key = (ip, (username or "").strip().lower())
        now = time.time()
        with self._lock:
            record = self._login_failures.get(key)
            failures = record[0] + 1 if record else 1
            locked_until = now + LOGIN_LOCKOUT_SECONDS if failures >= LOGIN_MAX_FAILURES else None
            self._login_failures[key] = (failures, locked_until)

    def record_login_success(self, ip, username):
        key = (ip, (username or "").strip().lower())
        with self._lock:
            self._login_failures.pop(key, None)

    def jobs_for_tenant(self, tenant, query=None):
        public_fields = (
            "job_id",
            "customer",
            "service_type",
            "priority",
            "status",
            "scheduled_for",
            "technician",
            "amount_usd",
        )
        rows = []
        for job in self._jobs:
            if job["company"] != tenant:
                continue
            row = {k: job[k] for k in public_fields}
            parts = job["technician"].split()
            row["tech_initials"] = (parts[0][:1] + (parts[1][:1] if len(parts) > 1 else "")).upper()
            if query:
                needle = query.strip().lower()
                haystack = " ".join(
                    str(row[k]) for k in ("job_id", "customer", "service_type", "status", "technician")
                ).lower()
                if needle not in haystack:
                    continue
            rows.append(row)
        return rows

    def customers_for_tenant(self, tenant):
        seen = {}
        order = []
        for job in self._jobs:
            if job["company"] != tenant or job["customer"] == "Internal - Security Audit":
                continue
            name = job["customer"]
            if name not in seen:
                seen[name] = {
                    "name": name,
                    "address": job["address"],
                    "phone": job["phone"],
                    "email": job["email"],
                    "jobs_count": 0,
                    "last_service": job["scheduled_for"],
                }
                order.append(name)
            seen[name]["jobs_count"] += 1
            if job["scheduled_for"] > seen[name]["last_service"]:
                seen[name]["last_service"] = job["scheduled_for"]
        return [seen[name] for name in order]

    def tenant_summary(self, tenant):
        tenant_jobs = [j for j in self._jobs if j["company"] == tenant]
        customers = {j["customer"] for j in tenant_jobs if j["customer"] != "Internal - Security Audit"}
        upcoming = sorted(
            (j for j in tenant_jobs if j["status"] == "Scheduled"),
            key=lambda j: j["scheduled_for"],
        )
        return {
            "tenant": tenant,
            "open_jobs": sum(1 for j in tenant_jobs if j["status"] in ("Scheduled", "In Progress")),
            "completed_jobs": sum(1 for j in tenant_jobs if j["status"] == "Completed"),
            "revenue_usd": sum(j["amount_usd"] for j in tenant_jobs if j["status"] == "Completed"),
            "customers": len(customers),
            "technicians": sum(1 for t in self._technicians if t["company"] == tenant),
            "upcoming": [
                {
                    "job_id": j["job_id"],
                    "customer": j["customer"],
                    "service_type": j["service_type"],
                    "scheduled_for": j["scheduled_for"],
                }
                for j in upcoming[:4]
            ],
        }

    def jobs_per_day(self, tenant, days=7):
        counts = {}
        for job in self._jobs:
            if job["company"] != tenant:
                continue
            date = job["scheduled_for"][:10]
            counts[date] = counts.get(date, 0) + 1
        dates = sorted(counts)[-days:]
        peak = max(counts.values(), default=1)
        return [
            {"date": d, "label": d[5:], "count": counts[d], "pct": int(counts[d] * 100 / peak)}
            for d in dates
        ]

    def export_jobs(self):
        export_fields = (
            "job_id",
            "company",
            "customer",
            "address",
            "phone",
            "email",
            "service_type",
            "priority",
            "status",
            "scheduled_for",
            "technician",
            "amount_usd",
            "internal_notes",
        )
        return [{k: j[k] for k in export_fields} for j in self._jobs]

    def export_jobs_csv(self):
        rows = self.export_jobs()
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        return buffer.getvalue()

    def technicians_all(self):
        return [dict(t) for t in self._technicians]

    def record_tracking_event(self, company, email, ref, source_ip):
        event = {
            "company": company[:200],
            "email": email[:200],
            "ref": ref[:200],
            "source_ip": (source_ip or "unknown")[:64],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        with self._lock:
            self._tracking_events.append(event)
            if len(self._tracking_events) > MAX_TRACKING_EVENTS:
                self._tracking_events = self._tracking_events[-MAX_TRACKING_EVENTS:]

    def tracking_event_count(self):
        with self._lock:
            return len(self._tracking_events)

    def campaigns_for_tenant(self, tenant):
        return [dict(c) for c in CAMPAIGNS if c["company"] == tenant]

    def campaign_get(self, tenant, campaign_id):
        for campaign in CAMPAIGNS:
            if campaign["company"] == tenant and campaign["id"] == campaign_id:
                return dict(campaign)
        return None

    def campaign_email_source(self, campaign):
        tenant_label = TENANTS.get(campaign["company"], {}).get("name", campaign["company"])
        pixel = "/OpenEmail/{}/{}/{}".format(
            campaign["company"], campaign["recipient"], campaign["ref"]
        )
        amount_block = ""
        if campaign.get("amount_usd") is not None:
            amount_block = '    <p>Amount due: ${:.2f}</p>\n'.format(campaign["amount_usd"])
        first_name = campaign["recipient_name"].split()[0]
        return (
            "From: {tenant} <{sender}>\n"
            "To: {rname} <{rmail}>\n"
            "Subject: {subject}\n"
            "Date: {sent} (UTC)\n"
            "X-FieldOps-Campaign: {cid}\n"
            "X-FieldOps-Tracking: open-tracking=on\n"
            "MIME-Version: 1.0\n"
            "Content-Type: text/html; charset=UTF-8\n"
            "\n"
            "<html>\n"
            '  <body style="font-family:Helvetica,Arial,sans-serif;color:#374151">\n'
            "    <p>Hi {first},</p>\n"
            "    <p>{body}</p>\n"
            "{amount}"
            "    <p>Thanks for your business,<br>The {tenant} team</p>\n"
            '    <p style="color:#9ca3af;font-size:11px">This message was sent by {tenant} using FieldOps 360 Email Delivery.</p>\n'
            '    <img src="{pixel}" width="1" height="1" alt="">\n'
            "  </body>\n"
            "</html>\n"
        ).format(
            tenant=tenant_label,
            sender=campaign["sender"],
            rname=campaign["recipient_name"],
            rmail=campaign["recipient"],
            subject=campaign["subject"],
            sent=campaign["sent_at"],
            cid=campaign["id"],
            first=first_name,
            body=campaign["body"],
            amount=amount_block,
            pixel=pixel,
        )

    def reset_runtime_state(self):
        with self._lock:
            self._tracking_events = []
            self._login_failures = {}
