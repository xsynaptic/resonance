---
status: reference
---

# Resonance vocabulary

The glossary of terms this project uses. Names here are binding: use the term, and avoid the words listed under _Avoid_.

## Language

### Content

**Entry**: A single piece of authored content in a collection, sourced from one MDX file. _Avoid_: document, record, node, item (reserve "item" for catalog rows).

**Collection**: A named set of Entries sharing one schema. A difference of length, tone, or subject is a Theme at most, and usually nothing at all. _Avoid_: content type, post type, model.

**Draft**: An Entry withheld from the site. Drafts here are complete pieces awaiting review, not stubs. _Avoid_: unpublished, hidden, private.

**Mix**: A recorded DJ set published as an Entry, carrying a Tracklist and downloadable audio. The central noun of the project; most other collections exist to describe, group, or connect the music in one. _Avoid_: session, podcast, episode.

**Tracklist**: The ordered sequence of Tracks in a Mix. Its timestamps, where available, are load-bearing: they drive Cue Sheet generation. _Avoid_: playlist, setlist.

**Track**: One piece of music inside a Tracklist, carrying its own Credits to Artists and Labels. A Track is never an Entry of its own. _Avoid_: song, tune, cut.

**Cue Sheet**: A downloadable index of a Mix's Tracklist, generated from its timestamps so a player can seek between Tracks. _Avoid_: chapters, markers, index.

**Release**: A published audio work by someone else (an album, EP, or compilation). A Release is what a Review is about, described by fields on the Review, and is never an Entry in its own right. _Avoid_: record, album, product.

**Review**: An Entry appraising one Release. The Review is the writing and the Release is its subject; the two carry separate dates because a Release can predate its Review by years. _Avoid_: critique, writeup.

**Post**: An Entry in the editorial stream. Everything written that is not a Mix, Review, or Page is a Post, whatever its shape: a quotation, a chart, a gallery of cover art, an essay. Shape lives in the body, in which MDX components the Entry reaches for, and carries no metadata. _Avoid_: article, blog post, note.

**Page**: A standalone Entry outside the editorial stream (about, colophon). Unlike other collections its URL mirrors its position in the file system. _Avoid_: static page.

**Theme**: What an Entry is about. Any Entry in the editorial stream may carry Themes, and a Theme is the only vocabulary that answers this question. There was once a parallel Format vocabulary for what shape an Entry took, removed on 2026-09-13 because its schema was identical to a Theme's and shape turned out to need no metadata at all. Do not reintroduce it: a shape that needs fields is a Collection, and a shape that needs none needs nothing. _Avoid_: tag, category, subject, topic.

**Graphic Design**: The Theme for visual work made rather than written about: cover art for a Release, layout, and whatever else comes. Named wider than the cover art that fills it today, so photo galleries and other design work join it without a rename. It was a Collection, then the `album-artwork` Format, before landing here. _Avoid_: album artwork, design, artwork, cover, sleeve.

**Selections**: A curated, ranked roundup of Releases or Tracks, held as a `selections` array in frontmatter and rendered by the `<Selections>` MDX tag. A Post may also hold its roundup as prose. Selections is a field and a tag, never a vocabulary: it was a Collection, then a Format, and is now neither. _Avoid_: list, roundup.

**Charts**: The Theme for the periodic rankings posted to forums and blogs through the late 2000s, a snapshot of a moment. The annual retrospectives are not Charts; the Essential Selections Series gathers those, because what separates them is standing rather than subject.

**Ephemera**: Printed material documented rather than authored (a scanned flyer, a postcard, a ticket). Nothing today. What separates it from Graphic Design is provenance, not medium: someone else made it, and where the copy came from is part of the record. Those provenance fields are what would make it a Collection; short of them it is a Post like any other. _Avoid_: scans, memorabilia, artifacts.

**Featured Image**: The single image representing an Entry in listings, page headers, and social previews. _Avoid_: hero, cover, thumbnail.

**Series**: An ordered, hand-curated sequence of Entries that may span Collections. Unlike a Term it is a reading order rather than a classification, and the Series owns its membership instead of being discovered from its members. _Avoid_: collection, playlist, set.

### Vocabulary and reference

**Term**: An Entry that exists to gather other Entries and has its own Detail Page: an Artist, Label, Style, Region, Era, Theme, or Series. _Avoid_: taxonomy (a vocabulary is a set of Terms), category, keyword.

Terms come in two idioms whose reference syntax is inverted, each written for its common case: a Controlled Vocabulary reference is a slug, because the list is short and known; an Open Vocabulary reference is a name, because most names will never be cataloged.

**Controlled Vocabulary**: A Term collection where nothing exists outside the list, so every reference must resolve: Styles, Regions, Eras, Themes. _Avoid_: taxonomy, enum, closed list.

**Open Vocabulary**: A Term collection naming an unbounded real world, most of which will never be cataloged: Artists and Labels. A reference is written as the name itself, and links when that name matches a cataloged Term. Name the Term outright when the bare name would miss it, or find the wrong one. _Avoid_: taxonomy, freeform, loose reference.

**Credit**: A single Artist or Label as named on an Entry or a Track. The unit an Open Vocabulary reference is written in, so it links only where the name is cataloged. _Avoid_: ref, loose reference, freeform.

**Artist**: A person or act that made music, a Mix, or a visual work. An Open Vocabulary Term. _Avoid_: act, performer, musician, project.

**Project**: A musical act or side project ("his side project Segment", Kaya Project). An Artist's `projects` are the acts it belongs to, the inverse of its `members`. _Avoid_: using it for anything you made or oversaw.

**Label**: A record label that put out a Release or a Mix. An Open Vocabulary Term, hierarchical, so a sub-label nests under its parent. _Avoid_: imprint, publisher.

**Style**: A genre of electronic music. Genres relate as a network, but the model simplifies them to a hierarchy. _Avoid_: genre, sound, tag.

**Region**: Where the music comes from, not where the writing was done. Hierarchical. _Avoid_: country, place, location, origin.

**Era**: The period the music belongs to (Mid 1990s, Early 2000s), which is the music's own time and not the Entry's publication date. Hierarchical. _Avoid_: period, decade, time, year.

**Term Index**: The map from a Term to every Catalog Item referencing it. Hierarchical Terms roll their descendants' items up, so a parent's Detail Page shows everything beneath it. _Avoid_: taxonomy data, lookup. Index is a data structure here and nowhere else; a page is never an index.

### Projection

**Catalog**: The unified cross-collection view of every user-facing Entry reduced to one common shape, used for listing, sorting, and pagination. _Avoid_: index, registry, manifest.

**Catalog Item**: One Entry projected into the flat shape a card renders. _Avoid_: card, row, record, entry.

Every page is one of two shapes, and its layout is named for the shape. The two cover the whole site, so reaching for a third name means the shape was misread.

**Detail Page**: The page for a single subject. A Term's Detail Page is still a Detail Page even though most of it is a paginated listing: the Term is the subject and the listing is what the Term has to say. _Avoid_: single, permalink, archive.

**List Page**: A paginated listing of many Entries with no subject of its own. Listing a Collection's Entries and listing a vocabulary's Terms are the same shape. _Avoid_: archive, index, feed, stream.

### Provenance

**Extraction**: The generation of the content tree from the WordPress dump. It set frontmatter shape until handover on 2026-09-03, after which the tracked tree became the record; a re-Extraction would overwrite it. _Avoid_: import, migration, sync.

**Triage**: The manual pass over Drafts in the tracked content repository, un-prefixing what should publish, with git behind it. _Avoid_: cleanup, review, curation.
