import { sqliteTable, text, integer, index, uniqueIndex, blob, primaryKey } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const services = sqliteTable('services', { id: text('id').primaryKey(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
export const orders = sqliteTable('orders', {
 id: text('id').primaryKey(), amount: integer('amount'), currency: text('currency').notNull().default('MMK'), serviceSnapshot:text('service_snapshot').notNull().default('{}'), paymentStatus:text('payment_status').notNull().default('Unpaid'), version:integer('version').notNull().default(0), internalNote:text('internal_note').notNull().default(''), deliveryNote:text('delivery_note').notNull().default(''), customerKey: text('customer_key').notNull(), customer: text('customer').notNull(), contact: text('contact').notNull(), serviceId: text('service_id').notNull(), serviceName: text('service_name').notNull(), details: text('details').notNull(), budget: text('budget').notNull().default(''), deadline: text('deadline').notNull().default(''), reference: text('reference').notNull().default(''), source: text('source').notNull(), status: text('status').notNull().default('New'), history: text('history').notNull(), telegramChat: text('telegram_chat'), notification: text('notification').notNull().default('pending'), notificationMessage: integer('notification_message'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (t) => [index('orders_customer_idx').on(t.customerKey), index('orders_created_idx').on(t.createdAt)]);
export const botSessions = sqliteTable('bot_sessions', { chatId: text('chat_id').primaryKey(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
export const webhookUpdates = sqliteTable('webhook_updates', { id: integer('id').primaryKey(), createdAt: text('created_at').notNull() });

export const payments = sqliteTable('payments', {
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),provider:text('provider').notNull().default('KBZPay'),transactionId:text('transaction_id').notNull(),payerName:text('payer_name').notNull(),amount:integer('amount').notNull(),status:text('status').notNull().default('Proof Submitted'),proofKey:text('proof_key').notNull(),proofType:text('proof_type').notNull(),reason:text('reason').notNull().default(''),createdAt:text('created_at').notNull(),verifiedAt:text('verified_at'),verifiedBy:text('verified_by'),
},(t)=>[uniqueIndex('payment_transaction_unique').on(t.provider,t.transactionId),index('payment_order_idx').on(t.orderId)]);
export const orderEvents = sqliteTable('order_events', {
 id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),actorId:text('actor_id').notNull(),actorRole:text('actor_role').notNull(),event:text('event').notNull(),fromStatus:text('from_status').notNull(),toStatus:text('to_status').notNull(),reason:text('reason').notNull().default(''),metadata:text('metadata').notNull().default('{}'),createdAt:text('created_at').notNull(),
},(t)=>[index('events_order_idx').on(t.orderId)]);

// Small private receipt/QR objects can use D1 when R2 is not enabled.
export const receiptImages = sqliteTable('receipt_images', {
 key:text('key').primaryKey(),contentType:text('content_type').notNull(),size:integer('size').notNull(),createdAt:text('created_at').notNull(),
});
export const receiptChunks = sqliteTable('receipt_chunks', {
 imageKey:text('image_key').notNull().references(()=>receiptImages.key,{onDelete:'cascade'}),position:integer('position').notNull(),data:blob('data',{mode:'buffer'}).notNull(),
},t=>[primaryKey({columns:[t.imageKey,t.position]})]);
