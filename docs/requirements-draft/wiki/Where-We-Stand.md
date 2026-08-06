**DRAFT for team review — nothing here is final.** Written 2026-08-06.

# Where we stand

Each agreed user story, its status, and what's missing. The **upload tool**
sends images from a memory card into a collection; the **tagging tool** opens
an existing upload so people can record the species in the pictures.

- ✅ **Works today**
- 🟡 **Partly works**
- ❌ **Not built yet**
- 🧩 **No tool owns this yet** — where it should live has to be decided before
  it can be built

---

## Uploading a batch of images once back online (F1)

> As a field worker, I want to upload the images from a memory card after I
> regain internet access, so that the captured data enters the system for
> identification.

**Status: 🟡 Partly works**

- Every image from the card lands in the collection you chose, in one place,
  and each file is checked after it arrives to make sure it is complete and
  undamaged.
- An upload is only counted as finished once every file has arrived. If some
  files fail, the upload is left open and shown as unfinished, never as done.
- Missing: nothing tells you whether you are online. If your connection has
  dropped, the tool does not say so.
- Missing: you cannot do anything at all until you are connected. The story
  says you can pick your folder and get the batch ready with no connection,
  and only need one when you press upload. Today, choosing the
  folder, looking over the images and picking the location all sit behind the
  connection.
- Missing: if you give up on an upload halfway through, the images already sent
  stay in storage. Nobody can find them and nothing removes them.

---

## Saying which camera each memory card came from (F2)

> As a field worker, I want to specify which camera location each memory card
> came from during upload, so that every image is tied to the correct place.

**Status: 🟡 Partly works**

- You cannot start an upload until you have chosen both a collection and a
  camera location. The button stays disabled and says why.
- Camera locations the chosen collection has used before are offered at the top
  of the list, so the usual one is easy to find.
- You can see exactly what will be recorded about the batch before you commit
  to uploading it.
- Missing: the tool lets you pick any camera location in the whole master list,
  including places that have nothing to do with the collection you are
  uploading to. The story says only locations belonging to that collection can
  be chosen.
- Missing: when you start the next card, the tool quietly keeps the previous
  card's collection, location, timezone and description. Convenient, but it can
  attach the wrong place to a card without saying anything.

---

## Telling the team new images are ready to be tagged (F3)

> As a field worker, I want to let the identification team know that new images
> have been uploaded, so that the species in them get identified promptly.

**Status: 🧩 No tool owns this yet — this needs a decision about where it should live**

- Nothing sends an announcement. The upload tool has no way to tell anyone
  anything, and the tagging tool has no way to receive a message.
- The nearest thing that exists: the tagging tool has a list of uploads that
  still need work, with a running count. It works, but someone has to go and
  look. It was never designed as an announcement.
- The notes you type when you upload are stored with the upload. They are not
  sent to anyone.
- The one part that holds: a failed or abandoned upload
  announces nothing — but only because nothing is ever announced.
- The team needs to decide where announcing belongs, and whether it should be
  something that arrives (a message) or something people check (a list). See Q7
  and Q1 on the questions page.

---

## Never exposing the location of endangered species (F4)

> As a field worker, I want confidence that uploading images of endangered
> species will not reveal where those species are, so that I don't put the
> animals — or myself — at risk of unwanted attention.

**Status: ❌ Not built yet**

- Neither tool has any idea that a species or a place could be sensitive. There
  is no such setting, no marker, and nothing that hides anything.
- Exact map coordinates are shown to anyone who is connected. They also sit in the
  data files written alongside every upload, and in the preview the upload tool
  shows you before you commit.
- Who can see what is decided entirely by the account details a person types in
  when they connect. There is no protection inside either tool.
- Missing: any way to tell, before you upload, whether your images will be
  protected. Nothing is shown either way.
- This one is also waiting on two decisions nobody has made: who marks a
  species or a place as sensitive, and what exactly "precise location" means
  (Q6 and Q11 on the questions page).

---

## Identifying species before uploading (A1)

> As a species identifier, I want to tag the species in my images before I
> upload them, so that the images and their identifications enter the system
> together in one pass.

**Status: 🧩 No tool owns this yet — this needs a decision about where it should live**

- There is nowhere to do this. The upload tool has no place to record a
  species. The tagging tool only opens uploads that already exist in a
  collection, so it cannot touch images still sitting on your own machine.
- One part holds by accident: an upload with no species on it is
  accepted and recorded as untagged. That is true because there is no way to
  add a species during upload at all.
- Everything else is out of reach: keeping tags while you have no connection,
  sending images and tags together in one pass, and having those early tags
  credited to the person who made them.
- The team needs to decide where this belongs — in the upload tool, in the
  tagging tool working on a folder on your own computer, or postponed. See Q8
  on the questions page.

---

## Saying which camera location the images came from while uploading (A2)

> As a species identifier, I want to state which camera location my images came
> from as I upload them, so that the identifications are tied to the right
> place.

**Status: 🟡 Partly works**

- You cannot upload until a collection and a camera location have been chosen,
  and what gets stored matches what you picked.
- Missing: the same problem as F2 — any camera location in the master list can
  be picked, not only ones belonging to your collection.
- Out of reach for now: the part about the location applying to species you
  identified before uploading. That cannot happen while there is nowhere to
  identify species before uploading (A1).

---

## Uploads surviving an unreliable connection (AL1)

> As a species identifier on unreliable internet, I want an interrupted upload
> to continue on its own when the connection returns, so that overnight uploads
> finish without my attention.

**Status: 🟡 Partly works**

- Every upload is written down on your own computer as it goes, so an
  interrupted one can be picked up later from where it stopped.
- Files that already arrived and were checked are never sent a second time.
  Continuing costs only what is left.
- A brief network hiccup is retried automatically, several times, before the
  tool gives up on that file.
- Missing: it does not continue on its own. When the connection comes back,
  somebody has to click Resume. An upload that drops at two in the morning sits
  there until you return to it.
- Missing: an upload that quietly stops making progress without producing an
  error is not spotted. An upload that has clearly failed does say so, but a
  stalled one just sits.

---

## Retrying a failed upload to the same place (AL2)

> As a species identifier, I want to retry a failed upload to the same
> destination as the previous attempt, so that I don't create duplicate or
> misplaced uploads.

**Status: 🟡 Partly works** — the closest of the set to done.

- A retry goes to exactly the same collection and camera location as the first
  attempt. You are never asked for the location again.
- Your files are re-checked against what was already sent before anything goes
  over the wire, and a file already sitting at the destination is never quietly
  written over.
- Missing: leftovers are never cleaned up. Nothing in the upload tool can
  remove anything, so files from a failed attempt stay where they are.
- Missing: on one path, if an attempt is interrupted very early, the tool tells
  you to start a fresh upload. The first attempt's images stay behind while the
  same images are sent again to a new place — so the collection ends up holding
  two partial copies rather than one upload.
- Cleaning those leftovers up runs straight into our own rule that uploaded
  data is never destroyed. That is Q2 on the questions page.

---

## Examining images closely (H1)

> As a species identifier, I want to zoom into and out of an image, so that I
> can spot species that are small, distant, or partly hidden.

**Status: ✅ Works today** — nothing known to be missing; the performance
target still needs Q14.

- You can enlarge an image far past the size it fits the screen at — about six
  times in the normal view, ten times full-screen — and drag it around to look
  at any part.
- Getting back to the whole picture is one click, and moving to the next image
  always starts it fitted to the pane, so you never inherit a confusing zoom
  from the last one.
- Long uploads stay smooth because only the images actually on your screen are
  drawn.
- Two things still to confirm rather than fix: nobody has yet tested this on a
  genuinely small, older laptop, and we have never agreed how much zoom counts
  as enough. See Q14 on the questions page.

---

## Identifying species in new uploads (H2)

> As a species identifier, I want to assign species to images in a new upload,
> so that the upload's data becomes usable for analysis.

**Status: 🟡 Partly works**

- Clicking a species labels the image you are looking at. An image can carry
  more than one species. One action can apply a species to everything you have
  selected. An empty frame can be labelled as empty.
- Your work is held on your own computer as you go and survives closing the
  browser. When you are ready you publish it, and then everyone with access
  sees it. Publishing is a deliberate, separate step — saving alone does not
  make your work visible to others.
- Partly: your name is whatever you typed into the settings box. Nothing checks
  it against who you actually are, and it is recorded once for each time you
  publish rather than against each individual identification. See Q5.
- Partly: the species list is one shared list used everywhere, not one per
  collection, and you can type in a species that is not on the list at all.
- Also affected by F4: labelling an image can reveal where it came from,
  because nothing anywhere hides a sensitive place.

---

## Confirming identifications that already exist (H3)

> As a species identifier, I want to review and confirm identifications that
> already exist on an upload, so that prior work is validated rather than
> redone.

**Status: 🟡 Partly works**

- Opening an image shows every species already recorded on it, with counts, no
  matter which older tool recorded them.
- You can fix a count, remove one wrong species without losing the others, or
  clear them all.
- Earlier data is copied aside and kept before anything is replaced, and the
  tool refuses to overwrite a change it has not seen — so someone else's work
  cannot be wiped out by accident.
- Missing: confirming something that is already correct records nothing at all.
  The tool works by comparing before and after, so if you agree with what is
  there, no trace of your review is kept. "Harold checked this upload on this
  date" cannot be produced today.
- Missing: no way to tell which images have been reviewed and which have not.
- Already decided as a gap: the "questionable" marker for flagging a hard
  image stays on your own computer and never reaches anyone else — it must be
  shared with the team.
- Partly: work can be traced back to a person for a whole upload, but not for
  each individual identification.

---

## The big picture

- **Uploading and looking at images are in good shape.** Getting a memory card
  into a collection, resuming after a dropped connection (by hand, for now),
  retrying to the same place, and examining images closely all work today,
  with a handful of named rough edges.
- **Protecting the locations of endangered species is not built at all —
  anywhere.** Neither tool knows that a place could be sensitive, and exact
  coordinates are visible to anyone who can connect. This is the single largest
  gap, and it is blocked on decisions the team has not made yet, not on
  building.
- **A few stories have no home yet.** Telling the team that new
  images have arrived, and identifying species before uploading, belong to no
  current tool. Someone has to decide where they should live before anyone can
  start.
