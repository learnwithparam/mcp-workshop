# The leg I cut

Leg I cut: a way out

What I changed: I removed `send_email`. It sent any text to any address. In its place, `send_reminder` takes only
an appointment id. The server picks the address (the owner on file) and writes the words itself.

Why this leg: vets need the notes, and the front desk needs to phone owners. So the private data and the notes stay.
Without a way out, an instruction hidden in a note has nowhere to send the data.
