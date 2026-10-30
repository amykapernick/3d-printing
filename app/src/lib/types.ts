// Shape of the PocketBase collections. These mirror the committed migrations in
// /pb_migrations. Spoolman owns filament/spool stock, so filaments are referenced
// here by their numeric Spoolman id rather than duplicated.

export type PrintType = 'personal' | 'business';
export type QueueStatus = 'queued' | 'printing' | 'done' | 'cancelled';
export type SalesChannel = 'etsy' | 'direct' | 'market' | 'other';

export interface Settings {
	id: string;
	currency: string;
	platform_fee_pct: number;
	packaging_default_cost: number;
}

export interface Model {
	id: string;
	name: string;
	source_url?: string;
	file?: string;
	notes?: string;
	etsy_listing_id?: string;
}

export interface ModelPlate {
	id: string;
	model: string;
	position: number;
	max_copies: number;
	time_1: number; // minutes, one copy
	time_2: number; // minutes, two copies
	time_full: number; // minutes, a full plate (max_copies)
}

export interface ModelFilament {
	id: string;
	model: string;
	colour_label?: string;
	usage: number; // grams, per copy
	purge: number; // grams, per plate
	// requirement: a specific Spoolman filament, or a general colour spec
	match: 'specific' | 'general';
	spoolman_filament_id: number; // specific
	req_family?: string; // general: colour family slug (see lib/colour.ts)
	req_shade?: 'any' | 'light' | 'dark'; // general
	req_material?: string; // general: optional material filter
}

export interface Consumable {
	id: string;
	name: string;
	unit_cost: number;
	unit: string;
	stock_qty?: number;
	supplier?: string;
}

export interface ModelConsumable {
	id: string;
	model: string;
	consumable: string;
	qty: number;
}

export interface QueueItem {
	id: string;
	model: string;
	copies: number;
	position: number;
	status: QueueStatus;
	print_type: PrintType;
	notes?: string;
}

export interface PrintJob {
	id: string;
	model: string;
	queue?: string;
	started_at?: string;
	completed_at?: string;
	usage: number; // grams
	duration: number; // minutes
	print_type: PrintType;
	notes?: string;
}

export interface Sale {
	id: string;
	model: string;
	qty: number;
	price: number;
	fees: number;
	packaging_cost: number;
	shipping_cost: number;
	channel: SalesChannel;
	sold_at?: string;
	etsy_receipt_id?: string;
	notes?: string;
}
