package security

import "strings"

// RedactSecret removes a request-scoped secret from a diagnostic message.
// An empty secret is ignored because strings.ReplaceAll with an empty search
// value would corrupt the message by inserting the replacement between runes.
func RedactSecret(message, secret string) string {
	if strings.TrimSpace(secret) == "" {
		return message
	}
	return strings.ReplaceAll(message, secret, "[redacted]")
}
