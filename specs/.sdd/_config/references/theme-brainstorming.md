# Theme & Vibe Brainstorming (UI Projects Only)

**⛔ GATE:** Do NOT force the user to specify individual CSS or design tokens manually. Instead, establish the design direction through a collaborative, theme-based discussion. Propose fully formed, high-aesthetic color palettes and design choices that match their vision.

1. **Style Reference Extraction:** Ask the user if they have any visual references (styleguides, mockups, color boards, logos, screenshots). Instruct them to drop these assets into the `specs/references/style/` directory. If they do:
   - Use the agent's file/image viewing tool to inspect any images, vectors, or text files in that directory.
   - Extract hex codes, typography patterns, and overall aesthetic keys from these files to derive the initial proposal.
2. **Ask for Vibe/Theme:** If no reference assets exist, ask the user to describe the vibe, theme, or reference style they want for the interface (e.g., "Neon Space/Sci-fi", "Cyberpunk", "Minimalist Glassmorphism", "Vintage Arcade").
3. **Propose Palettes:** Propose 2-3 distinct, named color palettes and typography pairings based on either the extracted references or the user's description. Focus on aesthetic feeling rather than raw hex codes initially.
4. **Iterate:** If the user dislikes parts of a proposal, adjust the colors, contrast, or fonts interactively.
5. **Establish Defaults:** Once the overall theme/vibe is approved, automatically generate the best-practice design tokens (border radii, transition durations, spacing scales, etc.) that match the aesthetic. Present a clean summary of the selected aesthetic and the generated token defaults for approval.
