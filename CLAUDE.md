# How to prepare presentations

Professor Winston in MIT gave a meaningful lecture about 'how to speak'. I extract the script into @how-to-speak-lecture-reference/how-to-speak-context.txt, and since there are missing details in scripts like pendrawing and slides, I additionally write detailed contexts in @how-to-speak-lecture-reference/how-to-speak-context.txt.

> One liner for this directory: `text draft with references -> web based slides`

# Categories
- teaching: Informing Purpose. audience will be undergraudate students, graduate
- paper-review: Introducing + Critique other's paper. Including Figures and Tables in the paper. Audiences have enough background knowledge.
- paper-presentation: Introducing my paper to others. Exposing purpose, not informing. Audiences have enough background knowledge.

# Structure and Style
Regardless of category, each directory inside three category directory will be a individual presentation. Each has /assets directory inside. And there will be some draft markdown inside. This will be like

- Title: ...
- Motivation: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
- Image1
- Image2, Image3
- Image4, lorem ipsum
- Video1
- List - Lorem ipsum - dolor sit amet - consectetur adipiscing
- Implement Detail - (Sometimes I want you to develop web-based interactive component in the screen)
...
- Contributions: * ... * ... *(Takeaway) ...

Each numbered list means unique slide.

I don't allow background image -- it should be blank white background, we don't allow multiple font types -- only use Times New Roman. Eliminate all unnecessary things, for instance, bullets are also sometimes not needed. Winston say so in the lecture. Don't include presenter name, dates, institution logos anywhere except the first slide. Less it More.

For the first slide, it has Title, Presenter(if omitted, it is Edgar (Myeongseok) Gwon), year(if omitted, use year of current date), Collaborator (if exist), sometimes I will ask you to put @how-to-speak-lecture-reference/no-laptop-no-phone.png image at the bottom of the slides if I say so.

And for other slides, If there is a colon, then the left part is the header, and the right part is the content. (if I want to use colon not for separating but for text, I will wrap them like `text:text`) Header should have less than 33 characters (including spacebar). If it is longer than that, ask user to shorten with suggestion. 33 characters will fit inside the header text box. Center aligned, side-gaps are allowed inside the box, and I want red color stroke for the boxes. So basically, for all header, I want them center-aligned, with stroke. If I get satisfied with more specific details, I will let you know, then you can specify more clearly here the Claude.md so that we can leverage that information later. For header, of course, we fix the position, size (width, height), font all consistent along the presentations, regardless of the category. General Template itself. If I only refer image, then just put the image well fit. If I say a List and put some items there, then you should make center-aligned same shape boxes that can wrap the texts. It has same stroke as header, but different color. Use green for list item box strokes. When you make last slide, that might be like - Contributions: * ... * ... *(Takeaway) ..., for them, don't render everything at one slide. I need animation that the last one (takeaway) pops up at last.

Add slide numbers like 2/20 should be included in the right except first slide. So we begin with 2/N.

After making that file, you should let me know how to run that file. I guess, sometimes I will ask you to implement with mouse control and text-input enabled things, so that it should be properly chosen. And if I confirm, export as an pdf and also print the single image that contains all slides at once as well so that I can see the birdeye view. If there are video files inside, use snapshot instead.

I want two versions of presentation. I will put assets/reference.md which has list of `file name: reference`, mostly the reference will be DOI url or url. One should not include reference, one should include reference. For later one, put the reference in the left bottom side properly in the academic convention citation. Also make a reference page automatically at last. But in presentation I will use the one without reference for less distraction.

This file can be adjusted as time goes by and if user want to, but keep this file as a backup as well, and do version management.

In Icons Folder, I will collect all icons of frequently-used applications or sympols. (Like, ChatGPT, Claude, Gemini, Codex, Claude Code, Antigravity, Cursor, VS Code, etc,.) Actually you don't care at all.