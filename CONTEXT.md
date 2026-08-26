# Woow HA Records

A Home Assistant integration for keeping household records — money, possessions,
health, and notes — as first-class data inside Home Assistant rather than in a
separate app.

The integration is one **Area**-partitioned whole: four subject domains that
share a runtime but never share data.

## Language

The integration ships in English and Traditional Chinese, so each term carries
its canonical zh-Hant form. Both are binding: a term that drifts in one language
has drifted, and the `_避免_` list is as authoritative as `_Avoid_`.

### Structure

**Area**:
One of the four subject domains the integration covers: `finance`, `asset`,
`health`, `note`. Areas share no data and no vocabulary beyond this glossary.
_Avoid_: Module, Component, Sub-integration, Domain
_zh-Hant_: 領域 — documentation only. Area is a term for people building the
integration; nothing a user sees ever names it.

**Category**:
A grouping label a user creates to organise records within one Area. Asset
categories and note categories are unrelated to each other — a category never
crosses an Area boundary.
_Avoid_: Group, Folder, Tag, Collection
_zh-Hant_: 分類 (_避免_: 類別、群組、資料夾)

**Remark**:
Free-form text a user attaches to a Transaction, Account, Record, or Member.
Never a Note — a Remark has no Category and cannot stand on its own.
_Avoid_: Note, Comment, Annotation, Memo
_zh-Hant_: 備註 (_避免_: 筆記)

### Finance

**Account**:
A named ledger that holds Transactions and Recurring Plans, with a running
balance. A user may keep several.
_Avoid_: Wallet, Ledger, Config entry
_zh-Hant_: 帳戶 (_避免_: 帳號、帳目)

**Transaction**:
A single dated movement of money into or out of an Account. Kept permanently —
transactions are never pruned or aggregated away.
_Avoid_: Entry, Payment, Record
_zh-Hant_: 交易 (_避免_: 收支、帳目)

**Recurring Plan**:
A rule that generates Transactions on a daily, weekly, monthly, or yearly
cadence.
_Avoid_: Subscription, Schedule, Standing order
_zh-Hant_: 週期計畫 (_避免_: 定期計畫、循環計畫) — 週期 is already bound to the
API's `recurring`, and 定期 reads as 定期存款 inside a finance context.

### Asset

**Asset**:
A household possession worth tracking — appliance, electronics, furniture —
carrying a purchase date, warranty period, brand, and monetary value.
_Avoid_: Item, Device, Product, Belonging
_zh-Hant_: 資產 (_避免_: 物品、財產)

### Health

**Member**:
A person whose health measurements are tracked. A household typically has
several.
_Avoid_: User, Profile, Patient, Config entry
_zh-Hant_: 成員 (_避免_: 使用者、家人)

**Record Type**:
A kind of measurement a Member can log — weight, blood pressure, feeding,
sleep. Each Member defines their own set.
_Avoid_: Metric, Field, Measurement type
_zh-Hant_: 紀錄類型 (_避免_: 項目、指標)

**Record**:
One logged value of a Record Type for a Member at a point in time. Kept
permanently.
_Avoid_: Entry, Log, Reading, Datapoint
_zh-Hant_: 紀錄 (_避免_: 記錄) — 記錄 is the verb, "to record"; the noun is always
紀錄. This governs every compound, including the integration's own name.

### Note

**Note**:
A markdown document belonging to exactly one Category, optionally pinned to sort
it above the rest.
_Avoid_: Memo, Document, Page, Remark
_zh-Hant_: 筆記 (_避免_: 備註、記事)
