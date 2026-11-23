# @xsynaptic/astro-comments

Static, moderated comments for Astro sites. A visitor posts to an endpoint, the comment waits as `pending`, a moderator approves it, and the next build renders it into the page. The package is headless: it ships data, behaviour and a markup contract, and the site owns every template and style. It also owns no storage or challenge provider: the site passes in a `CommentStore` and a `CommentChallenge`.

## Entry points

| Export | Holds | Runs on |
| --- | --- | --- |
| `.` | `approvedCommentSchema`, `defaultMessages`, `handleCommentSubmission` and the store and challenge interfaces | Any server |
| `./render` | `buildThread`, `renderCommentBody`, `toAuthorHref` | Build time |
| `./element` | `defineCommentsSection` and the `CommentChallengeWidget` interface | Browser |

`./render` stays separate so a server bundle never pulls in markdown-it.

## Mounting the handler

`handleCommentSubmission` is `Request → Response` and answers every method and failure itself (405 for anything but POST, 500 with a logged error), so a mount is one call. An Astro endpoint:

```ts
import type { APIRoute } from 'astro';

import { handleCommentSubmission } from '@xsynaptic/astro-comments';

export const prerender = false;

export const ALL: APIRoute = ({ clientAddress, request }) =>
	handleCommentSubmission(request, {
		challenge, // { tokenField, verify(token, remoteIp) }
		getClientIp: () => clientAddress,
		ipSalt: import.meta.env.COMMENT_IP_SALT,
		resolveThread: async (thread) => `/${thread}/`, // or undefined when no such page exists
		store, // { insert(comment), hasApprovedParent(thread, parentId) }
	});
```

## Threads

A comment belongs to a **thread**: an opaque key the site mints, one slug segment or several joined by single slashes (`mixes/voyager`). Keys take letters, digits, `-` and `_` only, so a pathname such as `/blog/post/` or `post.html` (the default key in Isso and Giscus) has to be reduced to its slug first. The handler asks `resolveThread(thread, request)` for the thread's page path on this site, which serves both the existence check and the redirect after a native form post; `undefined` rejects the submission, and anything that is not a same-origin path is a 500.

## Submission order

`handleCommentSubmission` rejects in this order, every local check before any network call:

1. Body size, from `content-length` (413); a missing header rejects too
2. Unreadable form (400)
3. Filled honeypot (400, answered as `invalid`)
4. Schema (400)
5. Form age under three seconds (400)
6. Missing challenge token (403)
7. Unknown thread (400)
8. Reply to a parent that is not approved on the same thread (400)
9. Challenge (403), last, since it may be a round trip and a rejection burns a single-use token

A request asking for `application/json` gets `{ message }` on failure and an empty 201 on success; a native form post gets plain text on failure and a 303 to `<threadPath>?comment=received#comments` on success.

## Markup contract

The element reads the light DOM a template renders inside `<comments-section>`, and throws on connect without a `[data-comment-form]`. Resonance's `comments-section.astro`, `comment-form.astro` and `comment-list.astro` are the reference.

| Selector or field | Role |
| --- | --- |
| `data-error-message` on the section | Fallback text when a rejection carries no message |
| `[data-comment-form]` | The form, required; it posts natively until the element takes over |
| `[data-comment-form-home]` | Where the form returns after a reply |
| `[data-open-form]`, `[data-close-form]` | Open and close the form |
| `[data-reply="<id>"]` | Reply button; the form moves after `#comment-<id>` |
| `#comment-<id>` | Each comment's element, also its permalink |
| `[data-comment-challenge]` | Container the challenge widget renders into |
| `[data-comment-notice]` | Shown once a comment is accepted, or after the native redirect |
| `[data-comment-error]` | Shows a rejection's message |
| `[data-remember]`, `[data-clear-stored]` | Opt in to remembering name, email and URL, and forget them |
| Fields | `thread`, `parentId`, `renderedAt`, `author`, `authorEmail`, `authorUrl`, `body`, and the honeypot `website` |

Reply buttons, `[data-open-form]` and the form start `hidden`; the element reveals what works once it connects. The honeypot is named `website`, which is Isso's real author URL field, so a form ported from Isso must rename its URL input.
