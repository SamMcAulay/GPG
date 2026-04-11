/**
 * Random self-deprecating Gary one-liners used in ephemeral responses
 * after a user clicks a signup button. Keep these short — they show as
 * a follow-up chat bubble, not a banner.
 */

const QUIPS_BY_ROLE: Record<string, string[]> = {
    tank: [
        "Signed you up as a Tank. Try not to face-pull like I always do.",
        "Tank confirmed. Remember: the boss is supposed to look at YOU.",
        "You're tanking. I'll be behind you, parsing grey as always.",
    ],
    healer: [
        "Healer locked in. Keep me alive, I beg you.",
        "A healer! Finally, someone competent on the roster.",
        "Healer signed up. I'll be the one dying in the fire — top priority.",
    ],
    dps: [
        "DPS confirmed. The bar is low. The bar is me.",
        "Signed you up as DPS. Please parse better than I do. It's not hard.",
        "Another DPS! Try not to stand in the bad stuff. I always do.",
    ],
    late: [
        "Marked as Late. Classic. I respect it.",
        "Late it is. We'll save you a spot near the back where I usually die.",
        "Running late? Don't worry, I'll be wiping us in the meantime.",
    ],
    decline: [
        "Benched. No shame — I probably should be too.",
        "Declined. More loot for the rest of us. Well, not me. I never win rolls.",
        "You're out. Enjoy your night off. I'll keep parsing grey for you.",
    ],
};

export function getGaryQuip(role: string): string {
    const quips = QUIPS_BY_ROLE[role] ?? [
        "Got it. Added you to the list.",
    ];
    return quips[Math.floor(Math.random() * quips.length)]!;
}
