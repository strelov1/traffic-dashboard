export const VEHICLE_TYPES = ['car', 'van', 'truck', 'bus', 'motorcycle', 'bicycle'] as const

export type VehicleType = (typeof VEHICLE_TYPES)[number]
