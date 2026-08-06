**DRAFT for team review — nothing here is final.** Written 2026-08-06.

# Questions to decide

Writing the stories and the tools' behavior down side by side turned up
stories that contradict each other and terms that were never defined. These
are team decisions.

Questions are numbered so they are easy to cite. The first six block the most
work; the rest are grouped by topic, read the groups that touch your work.
Where a likely direction already exists it is noted as a suggestion, not a
decision. Points settled during the first review are at the bottom, under
"Decided so far" — they become issues, not questions.

---

## The six that hold up the most work

### Q1. Announcements are supposed to say where the images came from, but sensitive places are supposed to stay hidden. Which rule wins?

F3 says the message telling the team about new images must name the
collection, the camera location or locations, how many images there are, and
the date. F4 says the exact location of an endangered species must never
reach anyone not authorised to see it. If an upload comes from a protected
camera, one of the two has to give way. Until this is settled, the announcement
cannot be built at all.

_Who should weigh in:_ the project director, plus whoever is responsible for
endangered-species policy.

### Q2. Is the debris left behind by a failed upload "real data"?

AL2 says that after a retry the collection holds exactly one upload, with no
leftovers from the failed attempt, which means deleting something. The
security rules say uploaded data is never destroyed. Whether those two collide
depends on whether a half-finished attempt counts as uploaded data. The
underlying notes assume it does not, because it was never complete, but nobody
has agreed that.

_Who should weigh in:_ the project director, plus whoever answers for data
integrity.

### Q3. Automatic logout is drafted, staying logged in is preferred — and what happens to unpublished work when a logout hits?

Work has been drafted to log people out when they sit idle, and there is also a
stated preference for staying logged in. One ruling is needed before more is
built. The drafted behavior already keeps a busy tool alive — an upload or
other long-running task defers the logout — so the logout itself will not stop
a running upload. The open part that matters most: identification work that
has been made but not yet published. Does a logout keep it, publish it, or
lose it?

_Who should weigh in:_ the project director and whoever owns the security
policy this comes from; the answer affects every volunteer.

### Q4. When a new upload overlaps an older one, may it replace it?

The existing written-out procedure offers "replace the previous upload" as an
option. Our rule that original uploaded data is never destroyed says it cannot.
If replacing is allowed, we need to know whether it truly deletes the old
upload or sets it aside and keeps it, and who is allowed to make that call — the
person uploading, the collection lead, or an administrator only.

_Who should weigh in:_ the project director and collection leads.

### Q5. How does a person's name get reliably attached to their work?

Today, both tools use whatever name you type into a settings box. Nothing checks
it against who you really are, and two people sharing a laptop are told apart
only by remembering to change it. Several stories say work is
"attributed to" the person who did it. If that is meant seriously, we need to
say how a person's identity is established in the first place.

_Suggestion:_ the username of the storage account a person connects with — to
be confirmed.

_Who should weigh in:_ the project director and the administrator who maintains
the system.

### Q6. What exactly counts as a "precise location" that must be hidden?

Our wording protects the _precise_ location, which implies a rougher, safer
version of a location may be shown. Nobody has said what that rougher version
is — the general region? the county? nothing at all, not even a hint? This is the
most load-bearing undefined word we have. Protecting sensitive locations,
announcing new uploads, and producing reports for sponsors all depend on the
answer.

One constraint to keep in mind: whatever the tools hide on screen, today
anyone who can connect can read the whole dataset directly, exact coordinates
included. Real protection almost certainly has to be set in the storage
permissions themselves, not just inside the apps.

_Who should weigh in:_ the project director and whoever is responsible for
endangered-species policy; a biologist's judgement matters here.

---

## Where things should live

### Q7. Where should "new images are ready" live, and should it arrive or be checked?

Nothing announces anything today. Two shapes are possible: a message that
arrives (email or similar), or a list people go and look at. Either would
satisfy F3; they differ in how reliable they are and how much effort they
demand of the person identifying. Also open: who receives it — everyone who can
identify in that collection, a named list, or one lead who passes it on — and
what stops a second announcement going out when an interrupted upload is
resumed.

_Who should weigh in:_ field workers and identifiers together — this is about
how the team actually works.

### Q8. Where should identifying species before uploading live?

A1 says people can tag species before they upload, so images and
identifications arrive together. No current tool can do it. It could go into
the upload tool, or the tagging tool could learn to work on a folder on your own
computer, or it could be postponed. Related: if tags are made in the field, how
long must they survive with no connection — until you close the program, until
the laptop restarts, or for weeks in the field?

_Who should weigh in:_ the project director, plus the identifiers who actually
want to work this way.

---

## Who is allowed to do what

### Q9. What levels of access exist, and what does each one allow?

Every written-out procedure assumes there are named levels of access — someone
who may upload, someone who may identify, someone who may see protected
locations. That list does not exist anywhere. A lead is supposed to be able to
change a volunteer's level, which is impossible until the levels have names.

_Who should weigh in:_ the project director, collection leads and the
administrator.

### Q10. Is "may see exact locations" a separate permission from "may identify species"?

Our own security wording says being allowed to identify images must not by
itself reveal protected locations, which suggests they are separate. If they
are, is the extra permission granted for a whole collection, or for individual
camera locations? A single collection can mix sensitive and ordinary places.
This ties into the ongoing permissions discussion.

_Who should weigh in:_ the project director and whoever owns endangered-species
policy.

### Q11. Who decides that a species or a place is sensitive?

Protecting sensitive locations assumes somebody has already marked them as
sensitive. No story says who does that, how, or how a
marking is changed later. Everything about location protection sits on top of
this.

_Who should weigh in:_ the project director and the administrator.

---

## Recording who did what

### Q12. Must confirming an identification that needs no change leave a record?

H3 says a review records that it happened and by whom. The tagging tool
works by comparing before and after, so agreeing with what is already there
changes nothing and therefore records nothing. If "Harold reviewed this upload
on this date" needs to exist, something new has to be built to hold it.

_Who should weigh in:_ the project director and the identifiers who do review
work.

### Q13. Should people be able to see which images have already been reviewed?

Reviewing is much harder if you cannot tell what has already been checked.
Nothing today shows this to anyone else. It came up while writing the stories
down and needs a yes or no before it counts as agreed.

_Who should weigh in:_ the identifiers who do review work; the project director
signs off.

---

## How good is good enough

### Q14. How responsive must zooming be, and on what kind of machine? How much zoom is enough?

H1 says zooming stays responsive on a small, low-powered laptop and that
detail is legible well beyond fit-to-screen. Neither can pass or fail until we
name a machine and a delay, and a minimum amount of zoom. Today the tool
enlarges about six times, or ten times full-screen — confirming that is the
target would be enough to close this.

_Who should weigh in:_ identifiers who work on older or smaller laptops.

---

## Words we never defined

### Q15. What is a "batch" — one memory card, or one sitting that may cover several cards?

The stories use "batch" and "one upload" loosely. Whether a person emptying
four cards in one evening produces one upload or four changes what the tools
must do, including the warning during upload that tells you which cards still
need a location.

_Who should weigh in:_ field workers, who know how a real evening's work looks.

### Q16. Which kinds of files count as images?

Today the upload tool takes ordinary photos and one common video format, and
ignores everything else in the folder. Whether unprocessed camera files or
other kinds of video should be accepted has never been decided.

_Who should weigh in:_ field workers and whoever knows what the cameras
produce.

### Q17. What makes a retry "the same upload"?

Is it the same memory card, the same destination, or a label given at the first
attempt? AL2's rule that a retry goes to the same place, and that the result
is one upload rather than two, cannot be checked without an answer.

_Who should weigh in:_ the project director.

### Q18. Is the species list one shared list, or one per collection — and may people record a species that is not on it?

The tagging tool uses one shared list for everything, and lets you type in a
species that is not on it as a request. One story assumes the list is
tied to a collection. These cannot both be right.

_Who should weigh in:_ the administrator who maintains the species list, plus
identifiers.

### Q19. Are counts of animals required on a new identification, and how does a count get recorded at all?

H3 says that reviewing shows existing species _and counts_. Nothing
anywhere says how a count is entered in the first place. Something is missing
from the written set.

_Who should weigh in:_ identifiers and whoever uses the resulting data for
analysis.

---

## Smaller, but still real

### Q20. May two people identify species in the same upload at the same time?

Today the tool refuses the second person's work when it clashes and offers to
either keep editing or throw it away and start from what is stored. Whether
that is the collaboration model we want has not been decided.

_Who should weigh in:_ identifiers and collection leads.

### Q21. Should starting the next card quietly keep the previous card's choices?

After finishing one card, the upload tool carries the collection, camera
location, name, description and timezone straight into the next one without
saying so. It saves typing and it can silently attach the wrong place to a
card.

_Who should weigh in:_ field workers who do several cards in a sitting.

### Q22. What should disconnecting mean — keep your local upload records, or clear them?

The upload tool's two ways of disconnecting currently behave differently; that
inconsistency is a bug and is being raised as an issue. The real question
underneath it: when you disconnect, should the tool keep its local record of
your uploads (convenient on your own laptop) or clear it (safer on a shared
one)? "Disconnect" needs one agreed meaning.

_Who should weigh in:_ the project director; anyone who shares a laptop should
be asked what they expect.

### Q23. How long must original images be kept, and what must a record of a change contain?

The security rules say original data is never destroyed and changes are traceable to who
made them. We never said for how long, what a record of a change has to
contain, who may read those records, or whether the records themselves can be
altered.

_Who should weigh in:_ the project director and whoever answers for the
project's data long-term.

### Q24. Are law enforcement and border patrol threats, stakeholders, or simply out of scope?

The source material lists them alongside poachers. Some of them may in reality
be legitimate oversight partners rather than people to defend against. Nothing
should be built for either until this is settled.

_Who should weigh in:_ the project director; likely needs a conversation
outside the team.

---

## Decided so far (first review, 2026-08-06)

These started as questions and were settled during review. Each becomes an
issue to build, not a question to discuss:

1. **The upload tool must offer only camera locations belonging to the chosen
   collection.** Offering the whole master list is a gap (part of the F2
   issue), not a design choice.
2. **The "questionable" flag must be shared with the team.** A flag that never
   leaves your own computer defeats its purpose. Gap.
3. **An upload that stops making progress must say so.** The exact number of
   minutes can be settled in the issue. Gap under AL1.
4. **An interrupted upload must resume on its own when the connection
   returns**, as AL1 says. Clicking Resume by hand is a gap, not the design.
5. **"Not looked at yet" and "looked at, nothing there" are different things**,
   and the tagging tool's untagged-versus-empty distinction is the intended
   rule.
6. **The two mismatched disconnect behaviors are a bug** and will be raised as
   an issue; what "disconnect" should mean is Q22 above.
