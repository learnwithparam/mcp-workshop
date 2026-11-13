# Closing part is blocked

The closing part needs `cr.agentgateway.dev/agentgateway:v1.7.0`. The build environment could not pull it. Both
`cr.agentgateway.dev` and `ghcr.io/agentgateway/agentgateway` were refused by the network policy.

So the tag and the config format could not be checked, and nothing was built around a guess.

Question for the owner: can the build environment be allowed to reach `cr.agentgateway.dev` (or the ghcr.io blob
host), or should the brief name a different pinned image?
