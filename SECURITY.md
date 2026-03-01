# Security Policy

## Data Handling

servicenow-mcp is designed with security as a priority:

### Authentication
- Supports OAuth 2.0 (preferred) and Basic authentication
- Credentials stored only in environment variables, never in code
- No credentials are logged or written to disk

### Access Control
- **Read-only by default**: All write operations disabled unless explicitly enabled
- **Table allowlist**: Only approved tables accessible unless ALLOW_ANY_TABLE=true
- **Script execution safeguards**: Requires both WRITE_ENABLED=true and SCRIPTING_ENABLED=true

### Production Recommendations
1. Never enable SCRIPTING_ENABLED=true in production unless absolutely necessary
2. Keep WRITE_ENABLED=false for read-only integrations
3. Use OAuth authentication over Basic auth
4. Regularly rotate credentials
5. Use service accounts with minimal required permissions

## Reporting Vulnerabilities

If you discover a security vulnerability, please open a GitHub issue or contact the maintainers.

## Known Limitations

1. **Script execution risk**: When enabled, execute_script_include can run arbitrary server-side code
2. **Natural language processing**: Simplified NLP may misinterpret commands - always verify
