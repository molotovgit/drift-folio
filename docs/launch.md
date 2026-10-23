# Launch: amirbek.is-a.dev

The site is live at **https://molotovgit.github.io/drift-folio/**. Getting the
`amirbek.is-a.dev` subdomain is one pull request to
[is-a-dev/register](https://github.com/is-a-dev/register), which **you** open
(their README asks that requests are not AI-generated, so this step is yours).

## 1. Open the request (≈ 5 minutes)

1. Fork https://github.com/is-a-dev/register (signed in as molotovgit).
2. In your fork, add the file **`domains/amirbek.json`**:

   ```json
   {
     "owner": {
       "username": "molotovgit",
       "email": "YOUR-CONTACT-EMAIL"
     },
     "records": {
       "CNAME": "molotovgit.github.io"
     }
   }
   ```

   Replace `YOUR-CONTACT-EMAIL` with the address you want public (their rules
   require a contact; a Discord or Twitter handle also works).

3. Open a pull request to `is-a-dev/register` and fill in their template
   without removing anything:
   - tick all seven requirement boxes (`[x]`);
   - **Website Preview** (between the markers): `https://molotovgit.github.io/drift-folio/`
   - **Website Purpose** (between the markers), in your own words, e.g. that it
     is your developer portfolio presenting your software projects, with a
     "Skip the game" text version.

Keep an eye on the PR: if a maintainer asks for a change, reply there.

## 2. After it is merged (I can do this part)

Only after `amirbek.is-a.dev` resolves (check `nslookup amirbek.is-a.dev`),
point GitHub Pages at it — doing it earlier would break the preview link
the maintainers review:

```bash
# from the drift-folio repo
echo amirbek.is-a.dev > public/CNAME
npm run deploy
gh api repos/molotovgit/drift-folio/pages -X PUT -f cname=amirbek.is-a.dev
# wait for the certificate (a few minutes), then:
gh api repos/molotovgit/drift-folio/pages -X PUT -F https_enforced=true
```

## 3. Before you share it

- Approve the five private project cards (C1, C2, C3, C7, C9) in
  `src/content/projects.ts` — the text is drafted at CV level.
- Add any contact links you want in the garage (`about.links` in the same file).
- Optional: the car's colour, the drift feel, more shortcuts — all tunable.
