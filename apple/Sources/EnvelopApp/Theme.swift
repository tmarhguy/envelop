import SwiftUI

/// Envelop theme: white + green + red. Sender bubble green, receiver red.
/// No emojis, no gradients. SF Symbols only.
public enum EnvelopTheme {
    public static let brand = Color(red: 0.76, green: 0.10, blue: 0.14) // envelop/tomato red
    public static let brandDark = Color(red: 0.62, green: 0.07, blue: 0.11)
    public static let sender = Color(red: 0.20, green: 0.62, blue: 0.30) // me: green
    public static let receiver = Color(red: 0.76, green: 0.10, blue: 0.14) // tomato: red
    public static let verified = Color(red: 0x1D / 255, green: 0x9B / 255, blue: 0xF0 / 255) // verified blue, every platform
    public static let bubbleText = Color.white
    public static var bubbleRadius: CGFloat { 18 }
}

public struct EnvelopAvatar: View {
    public init() {}
    public var body: some View {
        ZStack {
            Circle().fill(EnvelopTheme.brand)
            Image(systemName: "paperplane.fill")
                .foregroundStyle(.white)
                .font(.system(size: 16, weight: .semibold))
        }
        .frame(width: 34, height: 34)
        .accessibilityHidden(true)
    }
}
