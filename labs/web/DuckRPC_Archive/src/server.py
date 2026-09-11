import os
import secrets
import sys
from concurrent import futures

import grpc
from grpc_reflection.v1alpha import reflection
from grpc_health.v1 import health
from grpc_health.v1 import health_pb2
from grpc_health.v1 import health_pb2_grpc

from database import get_connection, initialize_database


# Allow generated gRPC files to import each other
sys.path.append(
    os.path.join(
        os.path.dirname(__file__),
        "generated"
    )
)

import duckrpc_pb2
import duckrpc_pb2_grpc


# Store active tokens in memory
ACTIVE_TOKENS = {}


def generate_token(username):
    token = secrets.token_urlsafe(32)
    ACTIVE_TOKENS[token] = username
    return token


def get_authenticated_user(context):
    """
    Extract and validate the Bearer token from gRPC metadata.
    """

    metadata = dict(context.invocation_metadata())

    authorization = metadata.get("authorization")

    if not authorization:
        return None

    if not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "", 1)

    return ACTIVE_TOKENS.get(token)


class AuthService(duckrpc_pb2_grpc.AuthServiceServicer):

    def Login(self, request, context):

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT username
            FROM users
            WHERE username = ? AND password = ?
            """,
            (request.username, request.password)
        )

        user = cursor.fetchone()

        conn.close()

        if not user:
            context.abort(
                grpc.StatusCode.UNAUTHENTICATED,
                "Invalid username or password"
            )

        token = generate_token(user["username"])

        return duckrpc_pb2.LoginResponse(
            token=token
        )


class ArchiveService(duckrpc_pb2_grpc.ArchiveServiceServicer):

    def SearchDocuments(self, request, context):

        username = get_authenticated_user(context)

        if not username:
            context.abort(
                grpc.StatusCode.UNAUTHENTICATED,
                "Authentication required"
            )

        query = request.query

        conn = get_connection()
        cursor = conn.cursor()

        try:
            # INTENTIONALLY VULNERABLE SQL QUERY
            sql = f"""
                SELECT id, title, owner, content
                FROM documents
                WHERE title LIKE '%{query}%'
            """

            cursor.execute(sql)

            rows = cursor.fetchall()

        except Exception:

            conn.close()

            context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "Search request could not be processed"
            )

        conn.close()

        documents = []

        for row in rows:

            documents.append(
                duckrpc_pb2.Document(
                    id=row["id"],
                    title=row["title"],
                    owner=row["owner"],
                    content=row["content"]
                )
            )

        return duckrpc_pb2.SearchResponse(
            documents=documents
        )


def serve():

    # Initialize challenge database
    initialize_database()

    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10)
    )

    # Register challenge services
    duckrpc_pb2_grpc.add_AuthServiceServicer_to_server(
        AuthService(),
        server
    )

    duckrpc_pb2_grpc.add_ArchiveServiceServicer_to_server(
        ArchiveService(),
        server
    )

    # Register gRPC Health Service
    health_servicer = health.HealthServicer()

    health_pb2_grpc.add_HealthServicer_to_server(
        health_servicer,
        server
    )

    # Enable gRPC Reflection
    SERVICE_NAMES = (
        duckrpc_pb2.DESCRIPTOR.services_by_name[
            "AuthService"
        ].full_name,

        duckrpc_pb2.DESCRIPTOR.services_by_name[
            "ArchiveService"
        ].full_name,

        health.SERVICE_NAME,

        reflection.SERVICE_NAME,
    )

    reflection.enable_server_reflection(
        SERVICE_NAMES,
        server
    )

    # Mark services as healthy
    health_servicer.set(
        "",
        health_pb2.HealthCheckResponse.SERVING
    )

    port = os.getenv("PORT", "50051")

    server.add_insecure_port(
        f"0.0.0.0:{port}"
    )

    server.start()

    print(
        f"DuckRPC Archive server listening on port {port}"
    )

    server.wait_for_termination()


if __name__ == "__main__":
    serve()