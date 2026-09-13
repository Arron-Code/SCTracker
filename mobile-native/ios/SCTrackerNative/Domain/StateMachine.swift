import Foundation

enum BatchAction: String, Codable, CaseIterable, Hashable {
    case issue = "ISSUE"
    case seal = "SEAL"
    case dispatch = "DISPATCH"
    case open = "OPEN"
    case markVoid = "MARK_VOID"
    case markDamaged = "MARK_DAMAGED"
}

enum BatchStateMachine {
    static func nextState(from state: BatchState, action: BatchAction) throws -> BatchState {
        switch (state, action) {
        case (.unissued, .issue): return .issued
        case (.issued, .seal): return .sealed
        case (.sealed, .dispatch): return .inTransit
        case (.inTransit, .open): return .opened
        case (.unissued, .markVoid), (.issued, .markVoid), (.sealed, .markVoid):
            return .void
        case (.issued, .markDamaged), (.sealed, .markDamaged), (.inTransit, .markDamaged):
            return .damaged
        default:
            throw SCTrackerFailure(
                code: .invalidTransition,
                detail: "\(action.rawValue) is not permitted from \(state.rawValue)"
            )
        }
    }
}
