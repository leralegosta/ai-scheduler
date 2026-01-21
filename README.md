# AI Schedule Generator

An AI-powered web app that generates strict, healthy daily schedules based on user constraints, goals, and preferences.
Image of website with example schedule:

<img width="817" height="760" alt="image" src="https://github.com/user-attachments/assets/fa2a86f3-07cc-4077-9059-e072f8079ae2" />


## Features
- Constraint-based schedule generation
- AI-generated JSON calendar
- Apple Calendar–inspired UI
- Currently set to a one day schedule
  
## Tech Stack
- React + TypeScript on the front end
- Node.js + Express on the back end
- Local LLM (Ollama) 

## Some bugs
- (FIXED!!!) If wake-up and sleep times are "weird" (like waking at 12 PM and going to sleep at 3 AM), the schedule will look very strange with a ton of empty space (for sleeping):

<img width="804" height="508" alt="image" src="https://github.com/user-attachments/assets/700df750-1f75-43c1-855e-5c0bf3a5b5fe" />

- Sometimes looks visually weird, the blocks sometimes are pushed to the right even though the times don't overlap:

<img width="804" height="128" alt="image" src="https://github.com/user-attachments/assets/ab55937d-bf26-4d30-8189-691071cc4502" />

- Also there are still occasionally bugs like a time slot being empty, or just weird stuff like "Focused work" for 5 hours straight

## Want to add: 
- Better looking UI
- Schedule more days
