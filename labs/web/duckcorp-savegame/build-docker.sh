#!/bin/bash

docker build --tag=duckcorp_savegame_challenge .

docker run -p 1337:80 --rm --name=duckcorp_challenge_container -it duckcorp_savegame_challenge