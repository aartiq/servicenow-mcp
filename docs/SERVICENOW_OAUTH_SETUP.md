# ServiceNow OAuth 2.0 Setup Guide

This guide walks you through creating an OAuth 2.0 application profile in ServiceNow for use with servicenow-mcp.

## Prerequisites

- ServiceNow instance access (admin or equivalent permissions)
- Ability to create OAuth applications in ServiceNow
- Your ServiceNow instance URL (e.g., `https://dev12345.service-now.com`)

---

## Step 1: Navigate to Application Registry

1. Log into your ServiceNow instance as an administrator
2. In the **Filter Navigator** (left sidebar), type: `oauth`
3. Click on **System OAuth > Application Registry**

   ![Application Registry Navigation](../screenshots/oauth-nav.png)

---

## Step 2: Create New OAuth Application

1. Click the **New** button in the Application Registry
2. You'll see a prompt asking "What kind of OAuth application?"
3. Select **Create an OAuth API endpoint for external clients**

   This option allows external applications (like servicenow-mcp) to authenticate to ServiceNow.

---

## Step 3: Configure OAuth Application Settings

Fill in the following fields:

### Basic Information

| Field | Value | Description |
|-------|-------|-------------|
| **Name** | `servicenow-mcp` | Descriptive name for your OAuth app |
| **Client ID** | *Auto-generated* | Will be generated automatically (save this!) |
| **Client Secret** | *Auto-generated* | Will be generated automatically (save this!) |
| **Active** | ✅ Checked | Must be active to use |

### Authorization Settings

| Field | Value | Description |
|-------|-------|-------------|
| **Accessible from** | `All application scopes` | Recommended for MCP server access |
| **Refresh Token Lifespan** | `8640000` | 100 days (default) |
| **Access Token Lifespan** | `1800` | 30 minutes (default) |

### Grant Types

Enable the following grant types:

- ✅ **Password** - Required for username/password authentication
- ✅ **Refresh Token** - Recommended for automatic token renewal
- ⬜ Client Credentials (optional)
- ⬜ Authorization Code (not needed for MCP server)

### Redirect URL

For servicenow-mcp, you can leave this blank or set to:
```
http://localhost:3000/callback
```

This is typically not used for password grant flows but may be required by some ServiceNow versions.

---

## Step 4: Save and Copy Credentials

1. Click **Submit** to create the OAuth application
2. **IMPORTANT**: Copy the following values immediately:
   - **Client ID**: A long UUID-like string (e.g., `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)
   - **Client Secret**: A long secret string (e.g., `z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4`)

   ⚠️ **Security Note**: The Client Secret will only be shown once! Store it securely.

---

## Step 5: Configure .env File

Add the OAuth credentials to your servicenow-mcp `.env` file:

```bash
# ServiceNow Instance
SERVICENOW_INSTANCE_URL=https://dev12345.service-now.com

# OAuth Authentication
SERVICENOW_AUTH_METHOD=oauth
SERVICENOW_CLIENT_ID=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
SERVICENOW_CLIENT_SECRET=z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4
SERVICENOW_USERNAME=your_username
SERVICENOW_PASSWORD=your_password

# Security Settings
WRITE_ENABLED=false
SCRIPTING_ENABLED=false
```

Replace:
- `dev12345.service-now.com` with your actual instance URL
- `a1b2c3d4...` with your actual Client ID
- `z9y8x7w6...` with your actual Client Secret
- `your_username` with your ServiceNow username
- `your_password` with your ServiceNow password

---

## Step 6: Test OAuth Authentication

### Using cURL

Test the OAuth endpoint directly:

```bash
curl -X POST "https://dev12345.service-now.com/oauth_token.do" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "username=YOUR_USERNAME" \
  -d "password=YOUR_PASSWORD"
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "dGhpc2lzYXJlZnJlc2h0b2tlbmV4YW1wbGU...",
  "scope": "useraccount",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

### Using the MCP Server

Start servicenow-mcp and verify OAuth authentication:

```bash
cd servicenow-mcp
npm run build
npm start
```

Check the logs for successful OAuth token acquisition:
```
[INFO] ServiceNow OAuth authentication successful
[INFO] Access token acquired, expires in 1800 seconds
```

---

## Common OAuth Scopes

Depending on your ServiceNow instance configuration, you may need to configure OAuth scopes:

| Scope | Description | MCP Server Needs |
|-------|-------------|------------------|
| `useraccount` | User account access | ✅ Required |
| `admin` | Administrative access | ❌ Not needed (risky) |
| `read` | Read-only access | ✅ Recommended for read-only mode |
| `write` | Write access | ⚠️ Only if WRITE_ENABLED=true |

Most ServiceNow instances use the default `useraccount` scope which provides appropriate access for servicenow-mcp.

---

## Troubleshooting

### Error: "invalid_client"

**Cause**: Client ID or Client Secret is incorrect

**Solution**:
1. Double-check credentials in `.env` file
2. Verify no extra spaces or line breaks
3. Re-generate OAuth application if needed

### Error: "invalid_grant"

**Cause**: Username or password is incorrect, or user account is locked

**Solution**:
1. Verify ServiceNow username and password
2. Check if account is active in ServiceNow (System Security > Users)
3. Ensure user has appropriate roles

### Error: "unauthorized_client"

**Cause**: OAuth application not properly configured

**Solution**:
1. Verify "Password" grant type is enabled
2. Check that OAuth application is Active
3. Ensure "Accessible from" is set correctly

### OAuth Application Not Showing

**Cause**: Insufficient permissions

**Solution**:
1. Ensure you have `admin` or `oauth_admin` role
2. Contact your ServiceNow administrator

### Tokens Expiring Too Quickly

**Cause**: Short Access Token Lifespan

**Solution**:
1. Navigate to your OAuth application
2. Increase **Access Token Lifespan** (e.g., 3600 for 1 hour)
3. Enable **Refresh Token** grant type for automatic renewal

---

## Security Best Practices

### 1. Use Service Accounts

Create a dedicated ServiceNow service account for servicenow-mcp:

```
Username: svc_mcp_server
Full Name: MCP Server Service Account
Email: mcp-server@yourcompany.com
Roles: itil, api_analytics_read (read-only recommended)
```

**Benefits**:
- Easier to audit MCP server actions
- Can be disabled without affecting users
- Scoped permissions (principle of least privilege)

### 2. Rotate Credentials Regularly

- Rotate OAuth Client Secret every 90 days
- Update passwords according to your security policy
- Use environment variables, never hardcode credentials

### 3. Limit OAuth Application Access

- Set "Accessible from" to specific application scopes if possible
- Disable unused grant types
- Set appropriate token lifespans (don't make them too long)

### 4. Monitor OAuth Usage

ServiceNow provides OAuth monitoring:

1. Navigate to **System OAuth > Statistics**
2. Review token generation frequency
3. Check for unusual access patterns
4. Set up alerts for failed authentication attempts

### 5. Use Read-Only Mode

Unless you specifically need write operations:

```bash
WRITE_ENABLED=false
SCRIPTING_ENABLED=false
ALLOW_ANY_TABLE=false
```

This limits servicenow-mcp to read operations only, reducing security risk.

---

## Alternative: Basic Authentication

If OAuth is not available or causes issues, you can use Basic Authentication:

```bash
SERVICENOW_AUTH_METHOD=basic
SERVICENOW_BASIC_USERNAME=your_username
SERVICENOW_BASIC_PASSWORD=your_password
```

⚠️ **Note**: OAuth is strongly recommended over Basic Auth for:
- Better security (tokens expire, passwords don't)
- Automatic token refresh
- Easier credential rotation
- Better audit trails

---

## Next Steps

After OAuth is configured:

1. ✅ Test authentication with MCP server
2. ✅ Configure Claude Desktop or Claude CLI with MCP server
3. ✅ Test basic operations (e.g., get table schema)
4. ✅ Review security settings and permissions
5. ✅ Set up monitoring and logging

---

## Additional Resources

- [ServiceNow OAuth 2.0 Documentation](https://docs.servicenow.com/bundle/zurich-platform-security/page/administer/security/concept/c_OAuthApplications.html)
- [OAuth 2.0 Password Grant](https://oauth.net/2/grant-types/password/)
- [ServiceNow REST API Explorer](https://developer.servicenow.com/dev.do#!/reference/api/zurich/rest)

---

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review ServiceNow system logs: **System Logs > System Log > All**
3. Open an issue on GitHub: https://github.com/aartiq/servicenow-mcp/issues
4. Consult your ServiceNow administrator

---

**Last Updated**: February 2026
**ServiceNow Versions Tested**: Xanadu, Yokohama, Zurich (latest three releases)
