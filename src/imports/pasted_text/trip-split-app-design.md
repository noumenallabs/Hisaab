Design a mobile-first responsive trip expense and settlement app named “TripSplit”.

PRODUCT GOAL
Allow travelers using different phones to join a trip, record shared expenses, split costs, see balances, settle debts, and maintain a permanent audit trail showing who changed what and when.

VISUAL STYLE
Create a clean, practical travel-finance interface. Use a light neutral background, charcoal text, emerald for money owed to the user, coral for money the user owes, and blue for primary actions. Use accessible contrast, compact layouts, Lucide-style icons, cards with no more than 8px corner radius, and clear financial typography. Avoid gradients, oversized headings, decorative illustrations, and excessive cards.

NAVIGATION
Use mobile bottom navigation with:
- Overview
- Expenses
- Balances
- Activity

SCREENS AND WORKFLOWS

1. Authentication
- Email magic-link sign-in
- Profile name and optional avatar
- Loading, invalid-link, and error states

2. Trips
- Active, settled, and archived trip tabs
- Show destination, dates, participants, total spending, and settlement status
- Create a trip or join using an invite link/code

3. Create Trip
- Trip name, destination, dates, base currency, and participants
- Generate a shareable invite link
- Roles: owner and member

4. Trip Overview
- Trip details and member avatars
- Total group spending
- “You are owed ₹2,400” or “You owe ₹1,250”
- Spending by category
- Recent expenses
- Primary “Add expense” button

5. Add or Edit Expense
- Description, amount, currency, date, category, notes, and receipt
- Categories: food, transport, accommodation, tickets, shopping, and other
- Select one or multiple payers
- Select participants included in the expense
- Split equally, by exact amounts, percentages, or shares
- Show live validation that paid and split amounts equal the total
- Preview each participant’s share before saving

6. Expenses
- Search and filter by date, category, payer, and participant
- Group expenses by date
- Show description, payer, category, amount, and user share
- Expense details include payers, split breakdown, receipt, notes, and history
- Allow authorized users to edit or soft-delete an expense

7. Balances
- Show how much every participant paid, owes, and should receive
- Simplify debts into the fewest practical transfers
- Example: “Arun pays Priya ₹1,250”
- Support full and partial settlements
- Clearly distinguish pending and completed payments

8. Record Settlement
- Payer, recipient, amount, date, payment method, reference, and note
- Prevent settlements larger than the outstanding balance
- Show confirmation before saving
- Recalculate balances immediately

9. Activity and Audit Log
- Immutable chronological history
- Record expense, split, settlement, membership, and trip changes
- Show actor, action, affected record, date, and exact time
- Human-readable examples:
  “Priya changed Dinner from ₹2,400 to ₹2,650”
  “Arun recorded a ₹1,250 settlement to Priya”
- Detail view compares previous and new values
- Filter by member, action, record type, and date
- Audit entries cannot be edited or deleted

10. Trip Settings
- Edit trip details and currency
- Manage participants and roles
- Copy invite link
- Mark the trip settled when every balance reaches zero
- Archive without deleting expenses, settlements, or audit history

STATES AND COMPONENTS
Include empty, loading, saving, offline, validation, permission-denied, and error states. Add confirmation dialogs for deletion and settlements. Create reusable variants for buttons, inputs, currency fields, member selectors, category icons, expense rows, balance rows, filters, dialogs, toasts, and audit entries.

RESPONSIVE DESIGN
Optimize for one-handed mobile use, then create tablet and desktop layouts. Ensure amounts and member names never overflow. Create a clickable prototype covering:
create trip → invite members → add expense → configure split → edit expense → inspect audit history → review balances → record settlement → archive trip.

BACKEND AND DATABASE
Use Supabase for PostgreSQL storage, email authentication, real-time synchronization, receipt storage, and row-level security. Only trip members may access trip data. Owners manage membership. Use soft deletion for financial records.

Create these tables:

profiles:
id, name, email, avatar_url, created_at

trips:
id, name, destination, start_date, end_date, base_currency,
status, created_by, created_at, updated_at, updated_by

trip_members:
trip_id, user_id, role, joined_at, invited_by

expenses:
id, trip_id, description, amount, currency, category, expense_date,
notes, receipt_url, created_by, created_at, updated_by, updated_at,
deleted_by, deleted_at

expense_payers:
id, expense_id, user_id, amount_paid

expense_splits:
id, expense_id, user_id, amount_owed

settlements:
id, trip_id, from_user_id, to_user_id, amount, payment_method,
reference, note, settled_at, recorded_by, created_at,
updated_by, updated_at, deleted_by, deleted_at

audit_logs:
id, trip_id, actor_user_id, entity_type, entity_id, action,
previous_values_json, new_values_json, changed_fields,
request_id, created_at

AUDIT REQUIREMENTS
Generate audit logs automatically using PostgreSQL triggers, not only application code. Log create, update, soft-delete, restore, membership, and settlement actions. Audit records must be append-only and remain after the trip is archived. Never store passwords, authentication tokens, or receipt contents inside audit JSON.

Use Supabase Realtime so expenses, balances, settlements, and activity update across all participants’ phones without refreshing.