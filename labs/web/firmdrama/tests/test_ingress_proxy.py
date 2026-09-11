"""Socket-level regressions for ingress forwarding and connection cleanup."""

import asyncio
import unittest
from unittest.mock import patch

try:
    import ingress_proxy as proxy
except ModuleNotFoundError:
    # The application image intentionally does not include the separate proxy.
    proxy = None


@unittest.skipIf(proxy is None, "Run ingress tests from the repository or ingress image")
class IngressTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tasks = set()
        self.writers = []
        self.slots = asyncio.Semaphore(1)
        self.patches = [
            patch.object(proxy, "connection_slots", self.slots),
            patch.object(proxy, "UPSTREAM_HOST", "127.0.0.1"),
            patch.object(proxy, "IDLE_TIMEOUT_SECONDS", 5),
        ]
        for item in self.patches:
            item.start()

    def track(self, handler):
        def connected(reader, writer):
            self.writers.append(writer)
            task = asyncio.create_task(handler(reader, writer))
            self.tasks.add(task)
        return connected

    async def connect(self, upstream_handler):
        self.upstream = await asyncio.start_server(
            self.track(upstream_handler), "127.0.0.1", 0
        )
        port_patch = patch.object(
            proxy, "UPSTREAM_PORT", self.upstream.sockets[0].getsockname()[1]
        )
        port_patch.start()
        self.patches.append(port_patch)
        self.ingress = await asyncio.start_server(
            self.track(proxy.handle), "127.0.0.1", 0
        )
        reader, writer = await asyncio.open_connection(
            "127.0.0.1", self.ingress.sockets[0].getsockname()[1]
        )
        self.writers.append(writer)
        return reader, writer

    async def asyncTearDown(self):
        for name in ("ingress", "upstream"):
            server = getattr(self, name, None)
            if server:
                server.close()
        for writer in self.writers:
            writer.close()
        # Let socket EOF complete normal proxy cleanup before cancelling tasks;
        # cancellation during its finally block can interrupt writer closure.
        if self.tasks:
            await asyncio.wait(self.tasks, timeout=1)
        for task in self.tasks:
            if not task.done():
                task.cancel()
        await asyncio.wait_for(asyncio.gather(*self.tasks, return_exceptions=True), 2)
        for writer in self.writers:
            await proxy.close_writer(writer)
        for name in ("ingress", "upstream"):
            server = getattr(self, name, None)
            if server:
                await asyncio.wait_for(server.wait_closed(), 2)
        for item in reversed(self.patches):
            item.stop()

    async def test_upstream_idle_close_reaches_client_and_releases_slot(self):
        closed = asyncio.Event()

        async def upstream(reader, writer):
            await reader.readexactly(4)
            writer.write(b"pong")
            await writer.drain()
            await asyncio.sleep(0.1)
            await proxy.close_writer(writer)
            closed.set()

        reader, writer = await self.connect(upstream)
        writer.write(b"ping")
        await writer.drain()
        self.assertEqual(await asyncio.wait_for(reader.readexactly(4), 1), b"pong")
        await asyncio.wait_for(closed.wait(), 1)
        self.assertEqual(await asyncio.wait_for(reader.read(1), 1), b"")
        await asyncio.wait_for(self.slots.acquire(), 1)
        self.slots.release()

    async def test_client_close_reaches_upstream(self):
        closed = asyncio.Event()

        async def upstream(reader, writer):
            self.assertEqual(await reader.readexactly(4), b"ping")
            writer.write(b"pong")
            await writer.drain()
            self.assertEqual(await reader.read(1), b"")
            closed.set()

        reader, writer = await self.connect(upstream)
        writer.write(b"ping")
        await writer.drain()
        self.assertEqual(await asyncio.wait_for(reader.readexactly(4), 1), b"pong")
        await proxy.close_writer(writer)
        await asyncio.wait_for(closed.wait(), 1)

    async def test_live_connection_preserves_multiple_large_responses(self):
        payload = b"response-data" * 16384

        async def upstream(reader, writer):
            for _ in range(2):
                await reader.readexactly(4)
                writer.write(payload)
                await writer.drain()
            await proxy.close_writer(writer)

        reader, writer = await self.connect(upstream)
        for _ in range(2):
            writer.write(b"ping")
            await writer.drain()
            self.assertEqual(
                await asyncio.wait_for(reader.readexactly(len(payload)), 2), payload
            )

    async def test_half_closed_client_receives_delayed_response(self):
        async def upstream(reader, writer):
            self.assertEqual(await reader.read(), b"ping")
            await asyncio.sleep(0.05)
            writer.write(b"pong")
            await writer.drain()
            writer.close()

        reader, writer = await self.connect(upstream)
        writer.write(b"ping")
        await writer.drain()
        writer.write_eof()
        self.assertEqual(await asyncio.wait_for(reader.readexactly(4), 1), b"pong")
        self.assertEqual(await asyncio.wait_for(reader.read(), 1), b"")
        await asyncio.wait_for(self.slots.acquire(), 1)
        self.slots.release()

    async def test_stalled_write_times_out(self):
        from unittest.mock import AsyncMock, Mock
        reader = Mock(read=AsyncMock(return_value=b"data"))
        writer = Mock()
        writer.drain = AsyncMock(side_effect=lambda: None)

        async def stall():
            await asyncio.Event().wait()

        writer.drain.side_effect = stall
        with patch.object(proxy, "IDLE_TIMEOUT_SECONDS", 0.02):
            with self.assertRaises(TimeoutError):
                await asyncio.wait_for(proxy.forward(reader, writer), 1)

    async def test_stalled_close_aborts_transport(self):
        from unittest.mock import AsyncMock, Mock
        writer = Mock()

        async def stall():
            await asyncio.Event().wait()

        writer.wait_closed = AsyncMock(side_effect=stall)
        with patch.object(proxy, "CONNECT_TIMEOUT_SECONDS", 0.02):
            await asyncio.wait_for(proxy.close_writer(writer), 1)
        writer.transport.abort.assert_called_once()


if __name__ == "__main__":
    unittest.main()
