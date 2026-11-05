# PPIS Spelling Bee

Page for the Spelling Bee preliminary round, published with GitHub Pages:
https://alishakanwar-crypto.github.io/ppis-spelling-bee/spelling-bee.html

## Question Paper Maker

https://alishakanwar-crypto.github.io/ppis-spelling-bee/paper-maker.html

`paper-maker.html` — a teacher types or pastes a question paper, the page checks it for
mechanical and structural mistakes (spacing, punctuation, British spellings, numbering
gaps, marks that do not add up, repeated questions), lays it out on A4 under the school
letterhead (`ppis-logo.png`) and prints it to PDF. Everything runs in the browser; the
draft is kept in that computer's local storage and nothing is uploaded.

## Spelling Bee

Every lab computer opens the same link and each finished paper is written straight
into one shared Google Sheet, with a separate tab per class and section
(Class 3A, Class 3B ... Class 8B). Backend: `spelling-bee-appsscript/`.
