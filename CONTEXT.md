# Woow HA Records

A Home Assistant integration for keeping household records — money, possessions,
health, and notes — as first-class data inside Home Assistant rather than in a
separate app.

The integration is one **Area**-partitioned whole: four subject domains that
share a runtime but never share data.

## Language

### Structure

**Area**:
One of the four subject domains the integration covers: `finance`, `asset`,
`health`, `note`. Areas share no data and no vocabulary beyond this glossary.
_Avoid_: Module, Component, Sub-integration, Domain

**Category**:
A grouping label a user creates to organise records within one Area. Asset
categories and note categories are unrelated to each other — a category never
crosses an Area boundary.
_Avoid_: Group, Folder, Tag, Collection

### Finance

**Account**:
A named ledger that holds Transactions and Recurring Plans, with a running
balance. A user may keep several.
_Avoid_: Wallet, Ledger, Config entry

**Transaction**:
A single dated movement of money into or out of an Account. Kept permanently —
transactions are never pruned or aggregated away.
_Avoid_: Entry, Payment, Record

**Recurring Plan**:
A rule that generates Transactions on a daily, weekly, monthly, or yearly
cadence.
_Avoid_: Subscription, Schedule, Standing order

### Asset

**Asset**:
A household possession worth tracking — appliance, electronics, furniture —
carrying a purchase date, warranty period, brand, and monetary value.
_Avoid_: Item, Device, Product, Belonging

### Health

**Member**:
A person whose health measurements are tracked. A household typically has
several.
_Avoid_: User, Profile, Patient, Config entry

**Record Type**:
A kind of measurement a Member can log — weight, blood pressure, feeding,
sleep. Each Member defines their own set.
_Avoid_: Metric, Field, Measurement type

**Record**:
One logged value of a Record Type for a Member at a point in time. Kept
permanently.
_Avoid_: Entry, Log, Reading, Datapoint

### Note

**Note**:
A markdown document belonging to exactly one Category, optionally pinned to sort
it above the rest.
_Avoid_: Memo, Document, Page
