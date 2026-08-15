import { register } from "./registry";
import { webhookConnector } from "./connectors/webhook";
import { teamsConnector } from "./connectors/teams";
import { emailConnector } from "./connectors/email";

// Register built-in connectors. New connectors (Teams, email, Slack, PagerDuty)
// are added here — dispatch needs no changes.
register(webhookConnector);
register(teamsConnector);
register(emailConnector);
