# HCI Project Team 3
A web-based calendar and scheduling tool built to help working students automatically detect schedule conflicts, organize their semester, and handle last-minute changes using mini-deadlines.

## UI Setup & Requirements

*   **Requirements:** Any modern web browser (Chrome, Firefox, Safari, Edge). 
*   **Test User ID/Password:** None required. The app relies on browser `localStorage` to save your calendar data and requires no login.
*   **How to Run:**
    *   **Live Version:** Visit the hosted GitHub Pages link: ***********
    *   **Local Version:** Clone the repository and simply double-click `index.html` to open it in your web browser. 

## Operating Instructions

1.  **Semester Setup:** Click **"Upload syllabus"** to load the hardcoded CS 4352 schedule. Click **"Next"**, then **"Add to calendar"**. Repeat this process by clicking **"Upload work schedule"**.
2.  **Conflict Checking:** The left sidebar will automatically alert you if there are overlaps between your classes and shifts. Overlapping days will have a red badge with a warning icon. You can click the red **"View conflicts"** button to see the specific details of the double-booking.
3.  **Last-Minute Handling (Mini-Deadlines):** Click on any assignment deadline (e.g., "DP4 Due"). Click **"Break into mini-deadlines"**. A preview dialog will show you the suggested times for checkpoints. Click **"Confirm & Apply"** to place these checkpoints in your free time and resolve the conflict.

## Implementation Limitations

*   **Document Upload:** The site does not actually scan uploaded PDFs. The upload buttons simulate the process using hardcoded data matching the provided sample syllabus and work schedule.
*   **Mini-Deadlines:** The site schedules checkpoints between 9 AM and 10 PM in 1-hour blocks. If no free time is found within the 4 days prior to the deadline, it will skip generating a checkpoint.

## Technologies Used

*   **HTML5:** Structure and semantic tags.
*   **CSS3:** Styling, grid/flexbox layouts, and custom properties for theming. 
*   **Vanilla JavaScript:** State management, logic, and DOM manipulation.
*   **LocalStorage API:** For saving calendar data across sessions.
