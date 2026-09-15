/**
 * Car parts inventory contract (CarPartsInventory and PartFormModal): the parts of a business, listed, created, edited
 * and deleted by its owner. The repair service consumes the same stock through AutoRepairRepository.
 *
 * The source table scopes by `business_id = business_profiles.id` of the owner, so the methods take that business id,
 * exactly as the screen passes `profile.id`.
 */
import type { CarPart, CarPartInput } from '../../types/carParts';

export interface CarPartsRepository {
  /** car_parts WHERE business_id ORDER BY created_at DESC, NULLs first, at most 1,000 rows. */
  listParts(businessId: string): Promise<CarPart[]>;
  /** INSERT { ...input, business_id } RETURNING *. */
  createPart(businessId: string, input: CarPartInput): Promise<CarPart>;
  /** UPDATE car_parts SET input WHERE id RETURNING *: exactly one row, or an error, as `.single()` requires. */
  updatePart(partId: string, input: CarPartInput): Promise<CarPart>;
  /** DELETE car_parts WHERE id. No table references car_parts. */
  deletePart(partId: string): Promise<void>;
}
