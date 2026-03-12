# Receipt Recognition Prompt Analysis

Reviewed file: `/Users/henrysopenclaw/.openclaw/workspace/receipt-proxy/src/index.js`

## Overall assessment

The current Gemini prompt is **materially better** than a strict “receipt detector” prompt.

What it already does well:
- Defaults `is_receipt` to `true`
- Explicitly includes many non-classic receipt forms:
  - faded / blurry / partial receipts
  - digital receipts
  - invoices / bills / statements
  - payment confirmations
  - fuel / parking / toll receipts
  - foreign-language receipts
- Tells the model to prefer **low confidence** over rejection
- Gives concrete extraction guidance for merchant / amount / category / confidence

That said, there are still a few ways the prompt could produce **false negatives** or overly weak outputs in production.

---

## Remaining false-negative risks

### 1. "Clearly NOT any kind of financial document" is still subjective
The prompt says:

> Set `is_receipt=false` ONLY if the image is clearly NOT any kind of financial document.

That is good in spirit, but models still make subjective calls. Some borderline documents may still get rejected if they don’t look like a classic till receipt.

Examples at risk:
- bank transfer confirmations
- card terminal slips with very little text
- order pickup slips
- service receipts with handwritten totals
- emailed booking confirmations that imply payment but don’t say “receipt”
- tax invoices without itemization
- screenshots cropped so only merchant + amount remain

### 2. The phrase "ANY image that shows a transaction amount, merchant name, or itemized list" is helpful, but not complete enough
This rule is strong, but some real-world receipts do **not** clearly show all three concepts.

Examples:
- merchant + date but no visible total on a partial crop
- amount + masked merchant logo only
- refund / return slips with negative totals
- payment confirmations showing only “Paid”, reference number, and account suffix
- invoices where the payable amount is on page 2 or at the bottom of a PDF

The prompt could be even more robust if it also treated these as receipts:
- reference numbers
- invoice numbers
- ABN / tax identifiers
- payment status text like `PAID`, `APPROVED`, `THANK YOU`, `TAX INVOICE`

### 3. "Blank or completely unreadable images" can be over-triggered
This is a reasonable false case, but models sometimes classify difficult images as unreadable too aggressively.

Risk cases:
- thermal receipts with low contrast
- motion blur where only 10–20% of text is legible
- dim photos with visible layout but little OCR confidence
- receipts folded in half

In practice, some of these should still be:
- `is_receipt=true`
- low confidence
- partial extraction

The prompt says this in spirit, but adding an explicit rule like “visible receipt-like layout alone is enough to keep `is_receipt=true`” would help.

### 4. "If no date visible, use today's date" may hide extraction uncertainty
This does not directly create false negatives, but it can create a different downstream problem:
- the model may confidently fabricate a date instead of admitting it is missing
- the processor may treat the output as more complete than it really is

This is especially risky for:
- partial receipts
- cropped digital confirmations
- invoices spanning multiple PDF pages

Safer behavior would be one of:
- allow `date` to be null when missing, or
- add a separate `date_inferred` / `missing_fields` signal

If the product wants a date fallback for UX reasons, that fallback may be better done **client-side**, not in the model prompt.

### 5. The prompt asks for a single merchant string, but logos / chains / franchise names can be ambiguous
The merchant instruction is good, but some documents only show:
- legal entity names
- app names instead of merchant names
- branch names
- mall kiosk descriptors
- card acquirer / payment processor name instead of merchant

In these cases, the model may decide the document is too ambiguous and reduce confidence too much, or occasionally reject it.

A better instruction would say:
- if the specific merchant is unclear, prefer the most recognizable brand, store, or payee text
- do not reject the document just because merchant identity is imperfect

### 6. Statements are included, but multi-transaction financial documents are still ambiguous
The prompt includes “statements,” but the extraction format assumes a **single** merchant / amount / category.

That mismatch can cause weird behavior:
- the model may reject statements because they do not fit the output schema well
- or it may pick an arbitrary line item

If statements are truly intended as acceptable input, the prompt should clarify how to map them into the schema.

For example:
- choose the primary transaction on screen
- or choose the total due / current payment event
- or mark low confidence but still `is_receipt=true`

Without that clarification, some statements may still become false negatives.

### 7. PDFs are supported technically, but the prompt does not explicitly mention multi-page behavior
The worker supports PDFs, which is good. But the prompt does not explicitly tell Gemini what to do if:
- page 1 is a cover page
- merchant appears on page 1 but total is on page 2
- invoice totals are in a summary block later in the document

This can lead to:
- false negatives for sparse first pages
- partial extraction with low quality

A helpful addition would be:
- “For PDFs, consider all visible pages before deciding `is_receipt=false`.”

### 8. Non-English / handwritten support is declared, but not operationalized
The prompt says foreign-language and handwritten receipts count, which is good.
But the model may still underperform because it is not instructed how to behave when OCR is weak.

Example improvement:
- if text is partially readable but receipt structure is obvious, set `is_receipt=true`
- transliterate merchant when possible; otherwise preserve native script
- if only amount/date are legible, still keep as receipt with low confidence

### 9. The response schema has no place for ambiguity or warnings
Right now the model returns only:
- `is_receipt`
- extracted fields
- `confidence`

This makes borderline cases harder to reason about. The client has already added an excellent fallback, but the prompt could further benefit from fields like:
- `review_reason`
- `missing_fields`
- `document_type` (`receipt`, `invoice`, `bill`, `payment_confirmation`, `statement`, `unknown_financial`)

That would reduce the chance of the model collapsing ambiguity into a binary rejection.

---

## Code-level findings from the client processor

While reviewing `/receipt-renamer/src/services/processor.js`, I found and fixed two meaningful bugs:

### 1. False-negative override did not treat `amount: 0` as real extracted data
Original logic:
```js
const hasData = data.merchant || data.amount || data.date;
```

Problem:
- `0` is falsy in JavaScript
- a valid zero-total receipt / refund / comped transaction could be treated as “no data”

Fix made:
```js
const hasData =
  Boolean(data.merchant) ||
  (data.amount != null && data.amount !== '') ||
  Boolean(data.date);
```

### 2. Override `reviewReason` was being overwritten in the review path
The false-negative override set:
```js
data.reviewReason = 'AI 判断可能不是小票，但检测到交易信息，请人工确认';
```

But later, the review branch replaced it with a generic confidence-based reason.

Fix made:
```js
const defaultReviewReason = confidence < 40 ? '置信度极低' : `置信度偏低 (${confidence}%)`;
const reviewReason = data.reviewReason || defaultReviewReason;
```

This preserves the more useful explanation for human review.

### 3. Receipt naming improved for hyphenated merchants
I also fixed the naming helper so hyphenated brands format better:
- `JB Hi-Fi` no longer becomes `Jb Hi-fi`
- dash-following letters are capitalized correctly

---

## Recommended prompt improvements

If I were tightening the Worker prompt, I would change it in these ways.

### Recommended addition 1: make receipt-like structure sufficient
Add something like:

> If the image has receipt-like structure (merchant/header, line items, totals block, payment footer, invoice layout, terminal slip layout, or transaction confirmation layout), keep `is_receipt=true` even if much of the text is unreadable.

### Recommended addition 2: expand the definition of financial evidence
Add:

> Treat any of the following as evidence for `is_receipt=true`: transaction amount, total, subtotal, GST/VAT/tax, merchant/payee name, invoice number, order number, reference number, approval code, card/payment confirmation text, or a recognizable receipt/invoice layout.

### Recommended addition 3: clarify PDF handling
Add:

> For PDFs, consider all visible pages before deciding `is_receipt=false`. If one page contains financial content, treat the whole document as a receipt/invoice document.

### Recommended addition 4: allow uncertainty without rejection
Add:

> If only one or two fields are readable (for example just amount + date, or merchant + total), still return `is_receipt=true` with low confidence.

### Recommended addition 5: explicitly handle refunds / credits
Add:

> Refund slips, return receipts, credit notes, and zero-total receipts still count as receipts/financial documents.

This matters because refund and reversal documents often break rigid extraction logic.

### Recommended addition 6: separate document type from receipt validity
Best structural improvement:
- keep `is_receipt` broad
- add `document_type`

Example:
```json
{"is_receipt":true,"document_type":"invoice", ...}
```

That would reduce false negatives for invoices, statements, terminal slips, and payment confirmations that are real financial records but not “classic receipts.”

---

## Suggested revised prompt fragment

A stronger version of the critical section could be:

```text
CRITICAL — is_receipt MUST default to true.
Set is_receipt=false ONLY when the image is clearly unrelated to any transaction or financial record.

Keep is_receipt=true for any image or PDF that appears to be a receipt, invoice, bill, statement, refund slip, payment confirmation, terminal slip, toll/fuel/parking receipt, or other financial document.

Evidence that should usually keep is_receipt=true includes:
- merchant/payee/store name
- total/subtotal/tax/GST/VAT/amount paid
- line items
- date/time of transaction
- invoice/order/reference/approval number
- payment status text such as PAID, APPROVED, TAX INVOICE, RECEIPT, PAYMENT CONFIRMATION
- receipt-like or invoice-like layout even if text is partially unreadable

If only part of the document is readable, still return is_receipt=true with lower confidence rather than rejecting it.
For PDFs, consider all visible pages before deciding is_receipt=false.
Refunds, credits, and zero-total transactions still count as receipts/financial documents.
```

---

## Bottom line

The current prompt is already much safer than a typical strict detector, and the new client-side fallback is an important second layer of protection.

However, the biggest remaining false-negative risks are:
1. sparse payment confirmations
2. low-text terminal slips
3. partial / cropped documents
4. multi-page PDFs
5. refund / credit / zero-total documents
6. documents with financial structure but weak OCR

My view: the system is now in a **much better place**, but one more prompt revision — especially around **receipt-like structure**, **PDF multi-page handling**, and **refund/zero-total documents** — would reduce false negatives even further.
