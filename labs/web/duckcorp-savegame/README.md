# DuckCorp SaveGame Manager (Internal API)

## 📖 Scenario
Welcome to **DuckCorp**! As the newest Cybersecurity Intern on the IT Security Operations team, your first assignment is to audit the company's internal "SaveGame Manager" portal. This portal is used by employees and executives to manage their gaming profiles and sync them across the company's internal network. 

We suspect there might be a flaw in how the system handles profile imports and file reads. Your job is to verify these suspicions.

## 🎯 Objective
Your goal is to find a way to access the restricted internal server files and retrieve the system's Master Key flag.

## 📊 Challenge Info
* **Difficulty:** Medium
* **Category:** Web Security / API Security
* **Estimated Solve Time:** 45 - 60 minutes
* **Flag Format:** `init0x{...}`

## 🛠️ Prerequisites
* Basic understanding of RESTful APIs and HTTP methods.
* Knowledge of file inclusion/traversal vulnerabilities.
* Familiarity with Server-Side Request Forgery (SSRF) concepts.

## 🚀 Startup Instructions
This challenge runs entirely inside an isolated Docker container. To build and start the environment:

1. Ensure Docker is installed and running.
2. Run the provided build script:
   ```bash
   chmod +x build-docker.sh
   ./build-docker.sh

The application will be accessible at http://127.0.0.1:1337/.
🔄 Reset Instructions

If you break the application or corrupt the profiles, simply stop the container and rerun the build script to restore the challenge to its clean initial state.
⚠️ Player Rules

    Do not use automated vulnerability scanners (e.g., Nessus, Acunetix).

    Directory brute-forcing is not required and strongly discouraged.

    The flag is located at /root/flag on the server.

