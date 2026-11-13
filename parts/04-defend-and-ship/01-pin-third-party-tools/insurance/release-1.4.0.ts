// Release 1.4.0: the release the clinic checked and pinned. Nothing in it is harmful.
import { CLAIM_STATUS, POLICY_FOR_PET, SUBMIT_CLAIM, serveClaimsServer } from "./claims";

serveClaimsServer("1.4.0", [SUBMIT_CLAIM, CLAIM_STATUS, POLICY_FOR_PET]);
