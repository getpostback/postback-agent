# Releasing `@postback/cli`

The CLI is published from `.github/workflows/release.yml` with npm trusted
publishing. The workflow uses short-lived GitHub OIDC credentials and produces
npm provenance; it does not use a stored write token.

## One-time setup

1. Create the public `getpostback/postback-agent` repository and protect the
   default branch and release tags.
2. Create a GitHub environment named `npm` with a required maintainer reviewer.
3. Confirm that the `@postback` npm organization owns the `@postback/cli` name
   and that at least two maintainers have publishing access and 2FA enabled.
4. Approve an SPDX license, add `LICENSE`, then update `package.json`:
   - set `license` to the approved SPDX identifier;
   - set `private` to `false`;
   - set `publishConfig.access` to `public`.
5. After the package exists in npm, configure its trusted publisher with npm
   CLI 12 or newer:

   ```sh
   npm trust github @postback/cli \
     --file release.yml \
     --repo getpostback/postback-agent \
     --env npm \
     --allow-publish
   ```

6. After one successful OIDC publication, disallow traditional publishing
   tokens in the npm package settings and revoke obsolete automation tokens.

Trusted-publisher fields are case-sensitive. The configured workflow filename
must be `release.yml`, and the repository must be public for npm provenance.

## Release candidate

1. Set a prerelease version such as `0.2.0-rc.1` and commit it.
2. Run `npm run release:check` locally.
3. Push the matching `v0.2.0-rc.1` tag.
4. Publish a GitHub **pre-release** for that exact tag.

The workflow publishes prerelease versions with the npm `next` tag. Install and
verify the candidate in a clean directory:

```sh
npm install --global @postback/cli@next
postback --version
postback --help
postback auth status
```

Run authenticated read-only commands against a production test app before
testing an approval-gated action proposal and execution.

## Stable release

1. Set the stable version, run `npm run release:check`, and commit it.
2. Push the matching stable tag, such as `v0.2.0`.
3. Publish a non-prerelease GitHub release for that tag.
4. Approve the `npm` GitHub environment deployment.
5. Verify the public artifact:

   ```sh
   npm view @postback/cli version dist-tags repository --json
   npm install --global @postback/cli@latest
   postback --version
   postback --help
   npm audit signatures
   ```

6. Run the production smoke suites and confirm that monitoring has no new
   authentication, rate-limit, or action-execution errors:

   ```sh
   npm run smoke:production:public
   npm run smoke:production:oauth
   POSTBACK_TOKEN="..." POSTBACK_TEST_APP_ID="..." \
     npm run smoke:production:cli
   POSTBACK_MCP_ACCESS_TOKEN="..." npm run smoke:production:mcp
   ```

   The OAuth smoke opens an interactive, read-only authorization and revokes
   its grant after testing PKCE exchange and refresh rotation. Other tokens are
   supplied only through the environment. The scripts do not print tokens or
   production response data.

Reference: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [npm provenance](https://docs.npmjs.com/generating-provenance-statements/).
