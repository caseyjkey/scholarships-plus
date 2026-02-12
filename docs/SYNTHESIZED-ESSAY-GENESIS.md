# Synthesized Essay Generation - Design Document

**Created:** 2026-02-02
**Status:** Ready for Implementation
**Priority:** High

---

## Overview

Generate original essay responses by combining the user's knowledge base, writing style, and relevant past experiences. Unlike simple reuse, this creates "synthesized" responses that carry forward the user's voice while avoiding bad patterns from prior years.

---

## Problem Statement

**Current Situation:**
- Users have 70+ prior scholarship essays (~144,000 words total)
- Existing system can autofill obvious fields (name, email, GPA)
- For essays, users must manually paste to ChatGPT and explain "what changed"
- Prior year's essays may contain uninspiring language or patterns to avoid