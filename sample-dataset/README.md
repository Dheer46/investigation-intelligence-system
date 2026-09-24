# Sample Investigation Dataset — "Tupudana Recruitment Case"

This is a fully synthetic (made-up) dataset built to demo the platform end to
end. No real people, phone numbers, bank accounts, or FIR numbers — everything
here was written for this demo. But the shape of it is realistic: a village
recruiter, a local transporter, and a Delhi "placement agency" trafficking
young women under the cover of fake job offers.

## The story

1. **Priya Verma**, 22, from Tupudana village near Ranchi, goes missing on
   14 July 2026 after "Kamla Aunty" (Kamla Devi) — a well-known local woman
   who arranges "city jobs" — says she needs her for final paperwork before a
   job in Delhi. Her father files an FIR two days later.
2. Three weeks later, **Sunita Oraon**, 19, from the next village over, goes
   missing the exact same way — same recruiter, same promised agency.
3. The Anti-Human Trafficking Unit spots the pattern, pulls call records, and
   finds a three-person chain: **Kamla Devi** (recruiter) → **Suresh Mahato**
   (local transporter, and her husband's cousin) → **Ashok Bhatia** in Delhi,
   who runs the fake agency "Shine Manpower Services."
4. Bank records show Bhatia paying Kamla Devi a "commission" and Suresh Mahato
   "transport charges" within two days of each disappearance — and money
   moving from a business account into Bhatia's personal account right after,
   a classic layering pattern.
5. A public Facebook job ad ties both handler phone numbers together, and an
   inter-state records check turns up a near-identical case against Bhatia
   in Bihar in 2024 — he's a repeat operator, not a one-off.

Load all of it into one case and "Analyze this case" should surface Kamla
Devi, Suresh Mahato, and Ashok Bhatia as the key connected people, with the
two disappearances and the payment trail as findings worth reviewing.

## Folders

| Folder | What's in it | Maps to upload type |
|---|---|---|
| `01_firs/` | The two missing-person FIRs | Police report |
| `02_intelligence_reports/` | AHTU pattern + network-mapping reports | Intelligence report |
| `03_call_detail_records/` | Call logs for the three suspects' numbers | Call records |
| `04_financial_records/` | Bank statements for all four accounts | Financial records |
| `05_osint/` | The Facebook job ad and the Bihar prior-case note | Open-source intel |

## How to use it

1. Create one new case (e.g. "Tupudana Recruitment Case").
2. Drag in every file from `01_firs/` first, then `02_intelligence_reports/`,
   then `03_call_detail_records/`, `04_financial_records/`, and `05_osint/` —
   picking the matching document type for each from the dropdown as you go.
3. Click **Analyze this case** and watch the findings come in.

Uploading them in a different order works too — this is just the order the
real investigation would have received them in.
