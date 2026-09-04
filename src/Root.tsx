import React from 'react';
import { Composition } from 'remotion';
import { Full, FULL_FRAMES } from './Full';
import { Scene1a, S1A_FRAMES } from './Scene1';
import { Scene1b, S1B_FRAMES } from './Scene1b';
import { Scene2, SCENE2_FRAMES } from './Scene2';
import { Scene3, SCENE3_FRAMES } from './Scene3';
import { Scene4, SCENE4_FRAMES } from './Scene4';
import { Scene5, SCENE5_FRAMES } from './Scene5';
import { Scene6, S6_FRAMES } from './Scene6';
import { FPS, HEIGHT, WIDTH } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Full"
      component={Full}
      durationInFrames={FULL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene1a"
      component={Scene1a}
      durationInFrames={S1A_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene1b"
      component={Scene1b}
      durationInFrames={S1B_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene2"
      component={Scene2}
      durationInFrames={SCENE2_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene3"
      component={Scene3}
      durationInFrames={SCENE3_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene4"
      component={Scene4}
      durationInFrames={SCENE4_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene5"
      component={Scene5}
      durationInFrames={SCENE5_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Scene6"
      component={Scene6}
      durationInFrames={S6_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
