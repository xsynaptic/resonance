# Resonance vocabulary

The glossary of terms this project uses. Names here are binding: use the term, and steer clear of the words listed under _Avoid_.

## Language

### Content

**Entry**: A single piece of authored content in a collection, sourced from one MDX file. _Avoid_: document, record, node, item (reserve "item" for catalog rows).

**Collection**: A named set of Entries sharing one schema. A Collection earns its existence by carrying fields that change behaviour; a difference of length, tone, or subject is a Format, not a Collection. _Avoid_: content type, post type, model.

**Draft**: An Entry withheld from the site by an `_` filename prefix, which the loader skips. Drafts here are complete pieces awaiting review, not stubs. _Avoid_: unpublished, hidden, private.

**Mix**: A recorded DJ set published as an Entry, carrying a Tracklist and downloadable audio. The central noun of the project; most other collections exist to describe, group, or connect the music in one. _Avoid_: session, podcast, episode.

**Tracklist**: The ordered sequence of Tracks in a Mix. Its timestamps, where available, are load-bearing: they drive Cue Sheet generation, which is why their shape is enforced rather than warned about. _Avoid_: playlist, setlist.

**Track**: One piece of music inside a Tracklist, credited to its own Artists and Labels. A Track is never an Entry of its own. _Avoid_: song, tune, cut.

**Cue Sheet**: A downloadable index of a Mix's Tracklist, generated from its timestamps so a player can seek between Tracks. _Avoid_: chapters, markers, index.

**Release**: A published audio work by someone else (an album, EP, or compilation). A Release is what a Review is about, described by fields on the Review, and is never an Entry in its own right. _Avoid_: record, album, product.

**Review**: An Entry appraising one Release. The Review is the writing and the Release is its subject; the two carry separate dates because a Release can predate its Review by years. _Avoid_: critique, writeup.

**Post**: An Entry in the editorial stream, of any Format. Everything written that is not a Mix, Review, or Page is a Post. _Avoid_: article, blog post, note.

**Page**: A standalone Entry outside the editorial stream (about, colophon). Unlike other collections its URL mirrors its position in the file system. _Avoid_: static page.

**Format**: What shape a Post takes: a quotation, an interview, a set of album artwork, a gallery of flyers. Format answers "what kind of thing is this", never "what is it about". A Format graduates to a Collection when it needs fields, not when it needs styling. _Avoid_: category, type, kind, tag.

**Topic**: What a Post is about, as opposed to what shape it takes. A Post carries one Format and any number of Topics, and the two vocabularies never overlap. _Avoid_: tag, category, subject.

**Album Artwork**: The Format for cover art made for a Release, presented with commentary. It held its own collection until it was found to carry no fields of its own. _Avoid_: design, artwork, cover, sleeve.

**Selections**: The Format for a curated, ranked roundup of Releases or Tracks, whether a monthly chart or an annual best-of. It held its own collection until it was found to carry one optional field that most of its entries never used; a Selections Post may hold its roundup as prose. _Avoid_: list, roundup.

**Ephemera**: Printed material documented rather than authored (a scanned flyer, a postcard, a ticket). A Format today. What separates it from Album Artwork is provenance, not medium: someone else made it, and where the copy came from is part of the record. Provenance fields are what would graduate it to a Collection. _Avoid_: scans, memorabilia, artifacts.

**Featured Image**: The single image representing an Entry in listings, page headers, and social previews. _Avoid_: hero, cover, thumbnail.

**Series**: An ordered, hand-curated sequence of Entries that may span Collections. Unlike a Term it is a reading order rather than a classification, and the Series owns its membership instead of being discovered from its members. _Avoid_: collection, playlist, set.

### Vocabulary and reference

**Term**: An Entry that exists to gather other Entries and has its own Detail Page: an Artist, Label, Style, Region, Era, Format, Topic, or Series. _Avoid_: taxonomy (a vocabulary is a set of Terms), category, keyword.

Terms come in two idioms, and the difference is real rather than accidental. In both, the bare form is whatever that vocabulary does most of the time, which is why the two read as opposites.

**Controlled Vocabulary**: A Term collection where nothing exists outside the list, so every reference must resolve: Styles, Regions, Eras, Formats, Topics. A bare slug links, and an unknown slug is a build error. _Avoid_: taxonomy, enum, closed list.

**Open Vocabulary**: A Term collection naming an unbounded real world, most of which will never be cataloged: Artists and Labels. A bare string is free text that renders plainly, and an object carrying an id links. _Avoid_: taxonomy, freeform, loose reference.

**Artist**: A person or act that made music, a Mix, or a visual work. An Open Vocabulary Term. _Avoid_: act, performer, musician, project.

**Project**: In this project's prose, a musical act or side project ("his side project Segment", Kaya Project). It means nothing else and names nothing in the model. _Avoid_: using it for anything you made or oversaw.

**Label**: A record label that put out a Release or a Mix. An Open Vocabulary Term, hierarchical, so a sub-label nests under its parent. _Avoid_: imprint, publisher.

**Style**: A genre of electronic music. Rhizomatic but modelled here for simplicity as hierarchical. _Avoid_: genre, sound, tag.

**Region**: Where the music comes from, not where the writing was done. Hierarchical. _Avoid_: country, place, location, origin.

**Era**: The period the music belongs to (Mid 1990s, Early 2000s), which is the music's own time and not the Entry's publication date. Hierarchical. _Avoid_: period, decade, time, year.

**Term Index**: The map from a Term to every Catalog Item referencing it. Hierarchical Terms roll their descendants' items up, so a parent's Detail Page shows everything beneath it. _Avoid_: taxonomy data, lookup. Index is a data structure here and nowhere else; a page is never an index.

### Projection

**Catalog**: The unified cross-collection view of every user-facing Entry reduced to one common shape, used for listing, sorting, and pagination. _Avoid_: index, registry, manifest.

**Catalog Item**: One Entry projected into the flat shape a card renders: id, collection, title, date, image, url. _Avoid_: card, row, record, entry.

Every page on the site is one of two shapes, and its layout is named for which one. Between them they cover everything, so a third name is a sign the shape was misread rather than a new kind of page.

**Detail Page**: The page for a single subject, laid out in `<x>-detail.astro`. A Term's Detail Page is still a Detail Page even though most of it is a paginated listing: the Term is the subject and the listing is what the Term has to say. _Avoid_: single, permalink, archive.

**List Page**: A paginated listing of many Entries with no subject of its own, laid out in `<x>-list.astro`. Listing a Collection's Entries and listing a vocabulary's Terms are the same shape. _Avoid_: archive, index, feed, stream.

### Provenance

**Extraction**: The generation of the content tree from the WordPress dump. It wipes every collection directory and re-emits, which makes it the writer of record for frontmatter shape and destructive to anything edited by hand. _Avoid_: import, migration, sync.

**Triage**: The manual pass over Drafts, un-prefixing what should publish. It is the one hand edit that matters in generated content, and the reason a re-Extraction has a real cost. _Avoid_: cleanup, review, curation.
