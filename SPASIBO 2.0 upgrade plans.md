# 1.1
### SPASIBO: Technical & Narrative Implementation Roadmap

## Windsurf Bug Report
**Engine Version:** 3.3.1 (single file)  
**Analysis Date:** May 10, 2026  
**Report Type:** Static code analysis

---

### Executive Summary

The SOBORNOST engine appears to be well-structured and robust with comprehensive error handling throughout. The codebase shows evidence of careful development with extensive validation, proper null checks, and graceful degradation patterns. However, several potential issues and areas for improvement were identified.

---

### Critical Issues

#### None Found

No critical bugs that would cause engine failure or data corruption were identified during the static analysis.

---

#### High Priority Issues

#### 1. Potential Memory Leak in Event Listeners
**Location:** Multiple locations in renderer functions  
**Severity:** High  
**Description:** Event listeners are added to DOM elements but may not be properly cleaned up when elements are removed or panels are closed.

**Evidence:**
```javascript
// Lines 1877-1880, 1914, 1950, etc.
d.querySelector('#tc')?.addEventListener('click',_continueGame);
btn.addEventListener('click', () => { ... });
```

**Impact:** Memory usage may increase over time, especially in long gaming sessions.

**Recommendation:** Implement proper cleanup of event listeners when DOM elements are removed.

#### 2. WebSocket Reconnection Logic
**Location:** Lines 1656  
**Severity:** High  
**Description:** The WebSocket reconnection logic in dev mode has a maximum retry limit but no exponential backoff.

**Evidence:**
```javascript
_ws.onclose=()=>{if(_retries<MAX_RETRIES){_retries++;setTimeout(_wsConnect,RETRY_DELAY);}else{console.warn('[SOBORNOST devMode] WS disconnected. Giving up')}};
```

**Impact:** May overwhelm the server during connectivity issues.

**Recommendation:** Implement exponential backoff for reconnection attempts.

---

### Medium Priority Issues

#### 3. Inconsistent Error Handling in localStorage Operations
**Location:** Lines 891, 960, 961, 970, 1013  
**Severity:** Medium  
**Description:** Some localStorage operations have try-catch blocks while others don't.

**Evidence:**
```javascript
// Line 891 - No try-catch
localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(state));

// Line 960 - Has try-catch
try { const r = localStorage.getItem(META_KEY); G.metaUnlocks = r ? JSON.parse(r) : {}; } catch (e) { G.metaUnlocks = {}; }
```

**Impact:** In localStorage is disabled or full, some operations may throw uncaught exceptions.

**Recommendation:** Wrap all localStorage operations in try-catch blocks.

#### 4. Potential Race Condition in Audio Initialization
**Location:** Lines 754-763, 773-774  
**Severity:** Medium  
**Description:** Audio system initialization may fail silently if Web Audio API is not available.

**Evidence:**
```javascript
try {
  // Audio initialization
} catch(e) { console.warn('Audio:',e); }
```

**Impact:** Audio features may be unavailable without clear user feedback.

**Recommendation:** Provide user feedback when audio initialization fails.

#### 5. Missing Input Validation in Some Public APIs
**Location:** Lines 157, 163, 167, etc.  
**Severity:** Medium  
**Description:** Some registration functions don't validate input parameters thoroughly.

**Evidence:**
```javascript
// Line 157 - Basic validation only
if (!sceneId || typeof sceneId !== 'string') { console.error('[SOBORNOST] setInitialScene() requires a non-empty scene ID string'); return; }
```

**Impact:** May cause runtime errors if invalid data is passed to engine APIs.

**Recommendation:** Implement comprehensive input validation for all public APIs.

---

### Low Priority Issues

#### 6. Hardcoded Magic Numbers
**Location:** Throughout the codebase  
**Severity:** Low  
**Description:** Many magic numbers are used without being defined as constants.

**Examples:**
- Line 215: `setTimeout(() => { if (t.parentNode) t.remove(); }, 3200);`
- Line 466: `const MAX_SOUNDINGS = 4;`
- Line 467: `const SOUNDING_THRESHOLD = 8;`

**Recommendation:** Define magic numbers as named constants for better maintainability.

#### 7. Inconsistent Code Style
**Location:** Throughout the codebase  
**Severity:** Low  
**Description:** Minor inconsistencies in code formatting and style.

**Examples:**
- Mixed use of single and double quotes
- Inconsistent spacing around operators
- Variable naming conventions

**Recommendation:** Adopt and enforce a consistent code style using linters.

#### 8. Debug Information in Production
**Location:** Line 1702  
**Severity:** Low  
**Description:** Debug validation messages may be visible in production.

**Evidence:**
```javascript
if(!issues.length)console.log('%c[SOBORNOST] validate() — all clear.','color:#90c060');
```

**Recommendation:** Ensure debug messages are only shown in development mode.

---

### Security Considerations

#### 1. XSS Prevention
**Status:** Good  
**Analysis:** The engine properly uses `textContent` instead of `innerHTML` in most places, reducing XSS risk.

#### 2. Data Validation
**Status:** Adequate  
**Analysis:** Input validation is present but could be more comprehensive.

#### 3. localStorage Security
**Status:** Standard  
**Analysis:** No sensitive data is stored in localStorage without encryption.

---

### Performance Considerations

#### 1. DOM Manipulation
**Status:** Good  
**Analysis:** The engine uses efficient DOM manipulation patterns with minimal reflows.

#### 2. Memory Management
**Status:** Fair  
**Analysis:** Most objects are properly cleaned up, but some event listeners may leak.

#### 3. Canvas Rendering
**Status:** Good  
**Analysis:** Canvas rendering is optimized with proper animation frame management.

---

### Positive Findings

#### 1. Comprehensive Error Handling
The engine has extensive error handling with graceful degradation patterns.

#### 2. Robust State Management
State management is well-designed with proper initialization and cleanup.

#### 3. Modular Architecture
Despite being a single file, the code is well-organized with clear separation of concerns.

#### 4. Extensive Validation
The validation system is comprehensive and provides useful feedback.

#### 5. Debug Support
Excellent debug support with detailed logging and validation tools.

---

### Recommendations

#### Immediate Actions
1. Implement proper event listener cleanup
2. Add exponential backoff to WebSocket reconnection
3. Wrap all localStorage operations in try-catch blocks

#### Short-term Improvements
1. Enhance input validation for public APIs
2. Improve error handling in audio initialization
3. Define magic numbers as constants

#### Long-term Enhancements
1. Implement comprehensive unit tests
2. Add performance monitoring
3. Consider TypeScript for better type safety

---

### Conclusion

The SOBORNOST engine is well-written and robust with no critical bugs. The identified issues are primarily related to edge cases, error handling consistency, and code maintainability. The engine demonstrates good software engineering practices and appears suitable for production use.

**Overall Risk Level:** Low  
**Recommended Action:** Address medium priority issues before next major release.


This document serves as a consolidated directive for the systemic expansion and technical refinement of the **SOBORNOST.js** engine and the **SPASIBO** narrative.

---

#### 1. Systemic & Engine Refinements
* **Theosis "Crossing Tax" Implementation**: Patch `newPlay()` in `sobornost.js` to ensure spiritual progress is both persistent and costly.
    * **Logic**: `const carried = Math.max(5, Math.min(85, S.G.theosis - 15));`
    * **Goal**: The body forgets; the soul retains. Ensure the final tier of illumination must be re-earned each crossing.
* **Ontological Map Gating**: Update `_renderMapPanelSide` to respect `theosisRequired` attributes.
    * **Logic**: If `node.theosisRequired > S.G.theosis`, omit from the render loop.
    * **Goal**: Physical access to sacred ship spaces (e.g., Aft Compartment) remains locked until ontological attunement is met.
* **Persistent Narrative Mutation**: Transition from binary flags to a `worldState` object.
    * **Logic**: Track `shipStability`, `sanctity`, and `socialTrust`. 
    * **Goal**: Use these values to dynamically swap text fragments and environmental descriptions rather than creating redundant branching scenes.

#### 2. Diegetic UI & Visual Feedback
* **Magnetic Deviation (Material Instability)**: Link `magneticDeviation` to CSS filters to represent the breakdown of physical reality.
    * **Low Deviation (>0.4)**: Apply `filter: blur(0.3px)` and a subtle `text-shadow` jitter to `.sp` paragraphs.
    * **High Deviation (>0.7)**: Introduce a low-opacity `interference` overlay to simulate the compass losing "true north."
* **Theosis Ambient Pulse**: Transform the `tier-illumined` state into a living visual cycle.
    * **Logic**: Use a 20s CSS animation on `:root` variables to cycle `--border` from cold blue toward `--gold` and back.
* **Cyrillic Flicker System**: Deepen the internal conflict between the agent mission and the chaplain persona.
    * **Logic**: Use `registerTranslation` to flicker UI labels (Map, Stats) into Cyrillic based on the `doubt` stat.
* **Cover Integrity HUD**: Provide immediate systemic feedback for agent exposure.
    * **Implementation**: Add a horizontal bar under the stats block with a color ramp (Green → Amber → Rust). Pulse the bar when `coverIntegrity <= 2`.

#### 3. Mechanical Narrative Depth
* **The Liturgical Clock**: Implement a 4-stage cycle (Matins, Lauds, Vespers, Compline) using `setLiturgicalHour`.
    * **Goal**: Create a rhythmic atmosphere. Matins focuses on industrial cold; Compline/Vespers increases NPC candour and anomaly intensity.
* **Soundings as Environmental Rituals**: Gate `offerSounding` calls by location and theosis tier.
    * **Goal**: A "Sounding" in the hold at high theosis yields liberation-theological insight; a sounding on the bridge at low theosis remains purely maritime/scientific.
* **Trauma-Informed Social Topology**: Expand the use of `recordNpcMemory`.
    * **Goal**: Track emotional states rather than facts. Use "Confessor" charism verbs to offer "Solidarity," mitigating NPC trauma at the potential cost of agent cover.

#### 4. Critical Content Expansion
* **Act Two Infrastructure**: Replace the `act_two_placeholder` with three core sequences.
    * **Sequences**: Anomaly Peak (physical manifestation), Radio Discovery (external contact), and the Confrontation with Othis.
* **Ritual Integration**: Properly hook the `sunday_service` ritual in `act_two_begin`.
    * **Goal**: Completion must grant theosis and unlock "Witness" codex entries.
* **Material Reality Anchoring**: Balance mystical themes with the banal.
    * **Implementation**: Increase descriptions of physical labor, cold, maintenance routines, and shared meals. The sacred only resonates against a backdrop of rusted, material reality.

---

#### Engine Assessments & Reviews

#### ChatGPT: The Liturgical-Political Machine
**Overall Rating**: 8.3/10 | **Potential**: 9.5+
* **Writing/Atmosphere**: 9.5/10
* **Systems/UI**: 6.8/10
* **Summary**: SPASIBO functions as a "liturgical-political atmosphere machine." Its greatest achievement is making the ship feel like a "wounded body" or a "memory archive" rather than a passive container for events. The foundation is intellectually authored and artistically ambitious, needing only stronger systemic friction to match its thematic weight.

#### DeepSeek: The Structural Prototype
**Overall Rating**: 7/10 | **Target**: 9/10
* **Narrative Design**: 8.5/10
* **Engine Integration**: 6/10
* **Summary**: A rare synthesis of theological mechanics and literary ambition. Success depends on tightening the link between backend state (Theosis/Deviation) and frontend manifestation. The mapping of Western names to Cyrillic via `registerNameMapping` is functionally elegant, but Act Two requires a concrete replacement for the current "placeholder" stubs.

#### Gemini: The Ontological Transformation
**Overall Rating**: 8.2/10
* **Atmosphere**: 9.5/10
* **Originality**: 9.5/10
* **Summary**: The writing demonstrates high discipline and trust in the player. The project is at its strongest when it treats transformation as a costly, destabilizing process of "participation in the divine light." The setting is metaphysically real, effectively using "Soundings" as a diagnostic tool for both the ship and the player's soul.

---
**Final Implementation Principle**: Preserve ambiguity while increasing systemic consequence. Move from a branching story to a participation in a changing, state-reactive reality.

## From Me:
1. Don't have Pavel talk about Paul. We're being subtle here. The game is informed by things, not screaming them.
2. Explain that the cats are cats. The player doesn't know. 
3. Improve the introductory popup at the start.
4. Use toaster popups for changes that occur.
5. After selecting a choice/moving to the next screen, position the screen back up at the top. You shouldn't have to scroll up to the start of a screen when you come to a new one.
6. Number this version of Spasibo as v1.1. Produce a changelog, and update it as we make updates. Auto iterate the numbering as you see fit.