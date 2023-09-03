<meta property="og:image"
    content="https://raw.githubusercontent.com/0ui/gif-scrubber/master/img/icon-128.png"/>

# gif-scrubber

GIF Scrubber is a Chrome extension that allows you to control gifs like a video player.

![](https://raw.githubusercontent.com/0ui/gif-scrubber/master/img/screenshot-main.png)

# Features

- Click and drag mouse to scrub a gif back and forth.
- Pause/play
- Fast forward/backward
- Slow motion
- "Explode" the gif to view individual frames
- Download all the frames of a gif to one zip file
- Edit the URL in the dotted box and hit enter to load a different gif
- Support for video links like Imgur (.gifv) and Gfycat

# Installation

Install from the [Chrome Web Store](https://chrome.google.com/webstore/detail/gif-scrubber/gbdacbnhlfdlllckelpdkgeklfjfgcmp) or [Firefox add-ons](https://addons.mozilla.org/en-US/firefox/addon/gif-scrubber3/)

After installation, right-click a gif or link to a gif and you should see an option to open GIF Scrubber:

![](https://raw.githubusercontent.com/0ui/gif-scrubber/master/img/screenshot-menu.png)

Click the GIF Scrubber option and the full player will open.

Gif Scrubber does not work on local files by default but you can get this working by enabling the "Allow access to file URLs" option in the Chrome extension management settings for GIF Scrubber.

# Building this project

### Install dependencies

> [!NOTE]  
> Required for further steps

`npm ci`

### Build distributable extensions

`npm run build` will generate loadable but static development extensions at `./dist/[target]` as well as a distributable version within `./dist/[target]/gif-scrubber_[version]_[target].zip`

### Build for development

- `npm start:chrome` will start a development server for the Chrome extension which will rebuild on save so you can quickly reload.
- `npm start:firefox` will do the same for Firefox

> [!WARNING]  
> The base manifest defaults to Chrome settings, i.e. `background.service_worker`, so you'll have to manually modify that to run the dev server for Firefox.
