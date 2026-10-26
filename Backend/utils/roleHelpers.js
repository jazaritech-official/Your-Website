/**
 * Shared authorization helpers.
 *
 * Consolidates the dual `isAdmin` boolean / `role` string system into
 * one place-of-truth.  Every check in the codebase should eventually
 * call these helpers instead of sprinkling raw role comparisons.
 *
 * IMPORTANT: These helpers must produce the EXACT same access decisions
 * as the existing scattered checks — they are a consolidation, not a
 * behaviour change.
 */

/**
 * True when the user has admin OR superadmin role.
 * Mirrors every `role === "admin" || role === "superadmin" || isAdmin` check.
 */
export function isAdmin(user) {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.role === "superadmin" ||
    user.isAdmin === true
  );
}

/**
 * True ONLY for superadmin.
 */
export function isSuperAdmin(user) {
  if (!user) return false;
  return user.role === "superadmin";
}

/**
 * True for admin OR superadmin.
 */
export function isAdminOrAbove(user) {
  return isAdmin(user);
}

/**
 * True for rider role.
 */
export function isRider(user) {
  if (!user) return false;
  return user.role === "rider";
}

/**
 * True for admin, superadmin, OR rider.
 */
export function isAdminOrRider(user) {
  if (!user) return false;
  return isAdmin(user) || user.role === "rider";
}

/**
 * True when the caller owns the resource OR is admin-or-above.
 * `resourceOwnerId` should be the string form of the resource owner's _id.
 * `caller` is the req.user object.
 */
export function isOwnerOrAdmin(caller, resourceOwnerId) {
  if (!caller || !resourceOwnerId) return false;
  return caller.id === String(resourceOwnerId) || isAdmin(caller);
}

/**
 * Validate an order status transition.
 * Returns { valid: boolean, reason?: string }.
 *
 * Allowed transitions (derived from current business rules in the codebase):
 *   Pending        → Processing | Packed | Shipped | Cancelled
 *   Processing     → Packed | Shipped | Cancelled
 *   Packed         → Shipped | Cancelled
 *   Shipped        → Out for Delivery | Reached Destination | Cancelled
 *   Out for Delivery → Reached Destination | Delivered | Cancelled
 *   Reached Destination → Delivered | Cancelled
 *   Delivered      → (terminal — no transitions allowed)
 *   Cancelled      → (terminal — no transitions allowed)
 */
const VALID_TRANSITIONS = {
  Pending:              ["Processing", "Packed", "Shipped", "Cancelled"],
  Processing:           ["Packed", "Shipped", "Cancelled"],
  Packed:               ["Shipped", "Cancelled"],
  Shipped:              ["Out for Delivery", "Reached Destination", "Cancelled"],
  "Out for Delivery":   ["Reached Destination", "Delivered", "Cancelled"],
  "Reached Destination": ["Delivered", "Cancelled"],
  Delivered:            [],  // terminal
  Cancelled:            [],  // terminal
};

/**
 * Validate that a transition from `from` to `to` is allowed.
 * @param {string} from  Current order status
 * @param {string} to    Desired new status
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateStatusTransition(from, to) {
  if (!VALID_TRANSITIONS[from]) {
    return { valid: false, reason: `Unknown current status: "${from}"` };
  }
  if (!VALID_TRANSITIONS[from].includes(to)) {
    return {
      valid: false,
      reason: `Cannot transition from "${from}" to "${to}". Allowed: ${VALID_TRANSITIONS[from].join(", ") || "(terminal — no transitions)"}`,
    };
  }
  return { valid: true };
}

/**
 * Order statuses in which a customer may still change their delivery
 * location.
 *
 * Pre-dispatch only: once the parcel is Shipped the goods may already be with
 * a rider, so silently redirecting the destination is unsafe.
 *   Pending / Processing / Packed  → changeable
 *   Shipped … Delivered / Cancelled → blocked
 */
export const LOCATION_CHANGEABLE_STATUSES = ["Pending", "Processing", "Packed"];

/**
 * Whether a customer may change the delivery location of `order`.
 * Returns { allowed: boolean, reason?: string }.
 *
 * TWO independent signals must BOTH permit the change:
 *   1. `status` must be pre-dispatch (LOCATION_CHANGEABLE_STATUSES).
 *   2. No rider may be assigned.
 *
 * The second guard is deliberately conservative: `assignRider`
 * (trackingController) has NO status guard, so an admin can attach a rider
 * while an order is still `Pending`/`Processing`. A rider already heading to
 * the old address must never have the destination moved underneath them — so
 * an assignment always wins over an otherwise-changeable status.
 */
export function canChangeDeliveryLocation(order) {
  if (!order) return { allowed: false, reason: "Order not found" };

  if (order.assignedRider) {
    return {
      allowed: false,
      reason: "A rider is already assigned to this order",
    };
  }

  if (!LOCATION_CHANGEABLE_STATUSES.includes(order.status)) {
    return {
      allowed: false,
      reason: `The delivery location can no longer be changed — this order is already "${order.status}"`,
    };
  }

  return { allowed: true };
}
