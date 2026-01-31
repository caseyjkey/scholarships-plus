# OASIS Portal Integration Research

## OAuth Discovery

Need to check if OASIS portal supports OAuth:
- Check: https://webportalapp.com/.well-known/oauth-authorization-server
- Check: https://webportalapp.com/api/docs
- Look for OAuth endpoints in page source

## If OAuth Available:
```
Student clicks "Connect OASIS"
→ Redirect to OASIS OAuth authorize endpoint
→ Student logs in there (with CAPTCHA)
→ OASIS redirects back with auth code
→ Exchange code for access token
→ Use token for API calls
```

## If No OAuth:
Use embedded browser window approach (see implementation below)
