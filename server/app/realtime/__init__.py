"""Live events: what screens and phones are told, and how it reaches every process.

service, inside its transaction   outbox.record()  -> outbox_events row + NOTIFY
same process, after commit        ws_manager.broadcast_soon()   (unchanged fast path)
every other process               dispatcher LISTEN -> broadcast to its own sockets
phones                            outbox.deliver_push() now, sweeper retries later
"""
