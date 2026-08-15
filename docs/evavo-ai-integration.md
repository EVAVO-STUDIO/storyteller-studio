# EVAVO AI integration

Storyteller Studio can use the shared AI platform for narration candidates, SFX/ambience, music, visual/video ingredients and project-specific adapters while preserving the exact approved narrator and cast identities already governed by this repository.

Local training can specialize authorised SFX/ambience or music through Stable Audio 3 and ACE-Step adapters. Larger video LoRA work is routed through Model Lab to a larger GPU. Language adaptation may help narration or dialogue candidate generation, but the model never becomes the cast or story authority. Voice references and any voice-specific dataset require explicit rights and consent.

No AI profile grants automatic recast, rewrite, take selection, title change or publication authority. The existing append-only cast continuity, performance routing and approval evidence remain canonical. Use `evavo-model-lab studio-plan --studio storyteller-studio --vram-gib 12` for current media routes.
