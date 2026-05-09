// ─── Constants ───────────────────────────────────────────────────────────────
const W = 960;
const H = 540;

const FLOOR_Y = [460, 320, 180];
const PLAYER_SPEED = 220;
const JUMP_VEL = -520;
const GRAVITY = 1000;

const HOLE_DEFS = [
  { x: 150,  floor: 0 }, { x: 550,  floor: 0 }, { x: 750,  floor: 0 },
  { x: 1050, floor: 0 }, { x: 1500, floor: 0 }, { x: 1750, floor: 0 },
  { x: 280,  floor: 1 }, { x: 780,  floor: 1 }, { x: 1180, floor: 1 },
  { x: 1650, floor: 1 }, { x: 480,  floor: 2 }, { x: 980,  floor: 2 },
  { x: 1600, floor: 2 },
];

const MOLE_SCORE   = [10, 20, 40];
const MOLE_PEEK_PX = 10;

const DIFFICULTY = [
  { visibleMs: [2200, 2800, 3400], spawnInterval: 1200, maxActive: 3 },
  { visibleMs: [1800, 2300, 2900], spawnInterval: 1000, maxActive: 3 },
  { visibleMs: [1400, 1900, 2400], spawnInterval:  850, maxActive: 4 },
  { visibleMs: [1100, 1500, 2000], spawnInterval:  700, maxActive: 4 },
];

// ─── MenuScene ────────────────────────────────────────────────────────────────
class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  preload() {
    this.load.video('menu_video', 'menu_bg.mp4', true);
  }

  create() {
    // Try video first, fallback to image, then gradient
    if (this.cache.video.exists('menu_video')) {
      const video = this.add.video(W/2, H/2, 'menu_video');
      this._menuVideo = video;
      video.on('created', () => {
        const scaleX = W / video.width;
        const scaleY = H / video.height;
        video.setScale(Math.min(scaleX, scaleY));
      });
      video.play(true);
    } else if (this.textures.exists('menu_bg')) {
      const scaleX = W / 1672;
      const scaleY = H / 941;
      this.add.image(W/2, H/2, 'menu_bg').setScale(Math.max(scaleX, scaleY));
    } else {
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x0f3460, 0x0f3460, 1);
      bg.fillRect(0, 0, W, H);
      bg.fillStyle(0x16213e, 1);
      for (let i = 0; i < 5; i++) bg.fillEllipse(i * 240 + 120, H - 40, 300, 140);
    }

    // Click or key anywhere to start — use time.delayedCall to avoid
    // the same pointerdown that started video playback triggering scene change
    this.time.delayedCall(300, () => {
      this.input.once('pointerdown', () => this._startGame());
      this.input.keyboard.once('keydown-SPACE', () => this._startGame());
      this.input.keyboard.once('keydown-ENTER', () => this._startGame());
    });
  }

  _startGame() {
    if (this._menuVideo) this._menuVideo.stop();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
}

// ─── Mole ─────────────────────────────────────────────────────────────────────
class Mole {
  constructor(scene, x, floorIndex) {
    this.scene      = scene;
    this.floorIndex = floorIndex;
    this.state      = 'idle';
    this.x          = x;

    const groundY  = FLOOR_Y[floorIndex];
    this.holeY     = groundY;
    this.peekY     = groundY + (52 - MOLE_PEEK_PX);
    this.shownY    = groundY;

    const hg = scene.add.graphics();
    hg.fillStyle(0x1a0a00, 1); hg.fillEllipse(x, groundY + 6, 48, 20);
    hg.fillStyle(0x2d1a00, 1); hg.fillEllipse(x, groundY + 3, 38, 13);
    hg.setDepth(8);

    this.flashGfx = scene.add.graphics().setDepth(8).setAlpha(0);

    if (!scene.textures.exists('mole_tex')) {
      const mg = scene.add.graphics();
      mg.fillStyle(0x8b6914, 1); mg.fillEllipse(20, 34, 36, 36);
      mg.fillStyle(0xa07820, 1); mg.fillCircle(20, 14, 14);
      mg.fillStyle(0xc49a3c, 1); mg.fillEllipse(20, 20, 14, 10);
      mg.fillStyle(0x3d1a00, 1); mg.fillCircle(20, 17, 4);
      mg.fillStyle(0x1a0a00, 1); mg.fillCircle(13, 9, 3); mg.fillCircle(27, 9, 3);
      mg.fillStyle(0xffffff, 1); mg.fillCircle(14, 8, 1.2); mg.fillCircle(28, 8, 1.2);
      mg.generateTexture('mole_tex', 40, 52);
      mg.destroy();
    }

    this.sprite = scene.add.image(x, this.peekY, 'mole_tex');
    this.sprite.setOrigin(0.5, 1).setDepth(9);
    this._updateCrop();
    this._visibleTimer = null;
  }

  _updateCrop() {
    const visiblePx = Math.max(0, this.holeY - (this.sprite.y - 52));
    this.sprite.setCrop(0, 0, 40, Math.min(52, visiblePx));
  }

  _flashHole() {
    this.flashGfx.clear();
    this.flashGfx.fillStyle(0xffff88, 1);
    this.flashGfx.fillEllipse(this.x, this.holeY + 3, 38, 13);
    this.scene.tweens.add({
      targets: this.flashGfx, alpha: 0.7, duration: 150, yoyo: true,
      onComplete: () => this.flashGfx.setAlpha(0),
    });
  }

  get isIdle() { return this.state === 'idle' || this.state === 'cooldown'; }

  rise() {
    if (this.state !== 'idle') return;
    this.state = 'rising';
    this._flashHole();
    this.scene.time.delayedCall(280, () => {
      if (this.state !== 'rising') return;
      this.scene.tweens.add({
        targets: this.sprite, y: this.shownY, duration: 280, ease: 'Back.Out',
        onUpdate: () => this._updateCrop(),
        onComplete: () => {
          this._updateCrop();
          this.state = 'visible';
          const diff = this.scene.currentDiff;
          this._visibleTimer = this.scene.time.delayedCall(
            diff.visibleMs[this.floorIndex],
            () => { if (this.state === 'visible') this.escape(); }
          );
        },
      });
    });
  }

  escape() {
    if (this.state !== 'visible') return;
    this.state = 'falling';
    if (this._visibleTimer) { this._visibleTimer.remove(); this._visibleTimer = null; }
    this.scene._onMoleEscape();
    this.scene.tweens.add({
      targets: this.sprite, y: this.peekY, duration: 220, ease: 'Quad.In',
      onUpdate: () => this._updateCrop(),
      onComplete: () => {
        this._updateCrop();
        this.state = 'cooldown';
        this.scene.time.delayedCall(900, () => { this.state = 'idle'; });
      },
    });
  }

  hit() {
    if (this.state !== 'visible') return false;
    this.state = 'hit';
    if (this._visibleTimer) { this._visibleTimer.remove(); this._visibleTimer = null; }
    this.scene.tweens.add({
      targets: this.sprite, y: this.peekY, duration: 180, ease: 'Quad.In', delay: 80,
      onUpdate: () => this._updateCrop(),
      onComplete: () => {
        this._updateCrop();
        this.state = 'cooldown';
        this.scene.time.delayedCall(700, () => { this.state = 'idle'; });
      },
    });
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0.2, duration: 80, yoyo: true,
      onComplete: () => this.sprite.setAlpha(1),
    });
    return true;
  }
}

// ─── GameScene ────────────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    this.load.image('bg', 'bg.png');
    this.load.image('platform', 'platform.png');
    this.load.image('crate', 'crate.png');

    // Load player animation frames
    for (let i = 0; i < 4; i++) {
      this.load.image(`player_idle_${i}`, `player_idle_${i}.png`);
      this.load.image(`player_run_${i}`, `player_run_${i}.png`);
      this.load.image(`player_attack_${i}`, `player_attack_${i}.png`);
    }

    this.load.on('loaderror', (file) => console.error('Load error:', file.src));
  }

  create() {
    // Init stats and difficulty FIRST — _buildMoles depends on currentDiff
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.totalPopped = 0; this.totalHit = 0;
    this.comboTimer = null; this.diffStage = 0;
    this.currentDiff = DIFFICULTY[0];

    this._buildWorld();
    this._buildPlayer();
    this._buildMoles();
    this._buildUI();
    this._setupInput();
    this.cameras.main.setBounds(0, 0, W * 2, H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0);
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  _buildWorld() {
    // Background — use image if loaded, otherwise fallback
    if (this.textures.exists('bg')) {
      // Image is 1920x540, place at center
      this.add.image(W, H/2, 'bg');
    } else {
      // Fallback gradient background
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x87CEEB, 0x87CEEB, 0x90EE90, 0x90EE90, 1);
      bg.fillRect(0, 0, W * 2, H);
    }

    this.platforms = this.physics.add.staticGroup();
    this._buildFloor1(); this._buildFloor2(); this._buildFloor3();
  }

  _buildFloor1() {
    this._makePlatform(0, FLOOR_Y[0], W * 2, 80, 0x4a7c59, 0x2d5a3d, 0);
    [[380,40],[420,40],[820,40],[860,40],[1300,40]].forEach(([x,w]) =>
      this._makeObstacle(x, FLOOR_Y[0]-40, w, 40, 0x8b4513));
  }
  _buildFloor2() {
    [[200,500],[650,950],[1100,1400],[1550,W*2]].forEach(([x,end]) =>
      this._makePlatform(x, FLOOR_Y[1], end-x, 24, 0x7b5e3a, 0x5c4020));
    this._makeObstacle(700, FLOOR_Y[1]-40, 40, 40, 0x8b4513);
    this._makeObstacle(1200, FLOOR_Y[1]-40, 40, 40, 0x8b4513);
  }
  _buildFloor3() {
    [[400,700],[900,1200],[1500,1800]].forEach(([x,end]) =>
      this._makePlatform(x, FLOOR_Y[2], end-x, 24, 0x9b7e5a, 0x7a5c30));
  }

  _makePlatform(x, y, w, h, ct, cb, alpha=1) {
    if (this.textures.exists('platform')) {
      const tiles = Math.ceil(w / 100);
      for (let i = 0; i < tiles; i++) {
        const tileX = x + i * 100;
        const tileW = Math.min(100, w - i * 100);
        const tile = this.add.image(tileX, y, 'platform').setOrigin(0, 0);
        tile.setCrop(0, 0, tileW, 24);
        tile.setAlpha(alpha);
      }
      // Use a 1x1 generated texture so staticGroup.create gets a valid body
      if (!this.textures.exists('_pixel')) {
        const pg = this.add.graphics();
        pg.fillStyle(0xffffff, 1); pg.fillRect(0, 0, 1, 1);
        pg.generateTexture('_pixel', 1, 1); pg.destroy();
      }
      const body = this.platforms.create(x + w/2, y + h/2, '_pixel');
      body.setVisible(false).setDisplaySize(w, h).refreshBody();
    } else {
      const g = this.add.graphics();
      g.fillStyle(cb,1); g.fillRect(0,0,w,h);
      g.fillStyle(ct,1); g.fillRect(0,0,w,12);
      g.generateTexture(`plat_${x}_${y}`,w,h); g.destroy();
      const p = this.platforms.create(x+w/2, y+h/2, `plat_${x}_${y}`);
      p.setAlpha(alpha).refreshBody();
    }
  }
  _makeObstacle(x, y, w, h, color) {
    if (this.textures.exists('crate')) {
      this.add.image(x, y, 'crate').setOrigin(0, 0);
      if (!this.textures.exists('_pixel')) {
        const pg = this.add.graphics();
        pg.fillStyle(0xffffff, 1); pg.fillRect(0, 0, 1, 1);
        pg.generateTexture('_pixel', 1, 1); pg.destroy();
      }
      const body = this.platforms.create(x + w/2, y + h/2, '_pixel');
      body.setVisible(false).setDisplaySize(w, h).refreshBody();
    } else {
      const g = this.add.graphics();
      g.fillStyle(color,1); g.fillRoundedRect(0,0,w,h,6);
      g.fillStyle(0x5c2d00,1); g.fillRect(0,10,w,4); g.fillRect(0,h-14,w,4);
      g.generateTexture(`obs_${x}_${y}`,w,h); g.destroy();
      this.platforms.create(x+w/2, y+h/2, `obs_${x}_${y}`).refreshBody();
    }
  }

  _buildMoles() {
    this.moles = HOLE_DEFS.map(({ x, floor }) => new Mole(this, x, floor));
    this._spawnEvent = null;
    this._scheduleSpawn();
  }
  _scheduleSpawn() {
    if (this._spawnEvent) this._spawnEvent.remove();
    this._spawnEvent = this.time.addEvent({
      delay: this.currentDiff.spawnInterval, loop: true,
      callback: this._spawnTick, callbackScope: this,
    });
  }
  _spawnTick() {
    if (this.timeLeft <= 0) return;
    const active = this.moles.filter(m => m.state==='rising'||m.state==='visible').length;
    if (active >= this.currentDiff.maxActive) return;
    const idle = this.moles.filter(m => m.isIdle);
    if (!idle.length) return;
    const weights = [3,2,1];
    const pool = idle.flatMap(m => Array(weights[m.floorIndex]).fill(m));
    const chosen = pool[Math.floor(Math.random()*pool.length)];
    this.totalPopped++;
    chosen.rise();
  }

  _onMoleEscape() {
    this._breakCombo();
    this.timeLeft = Math.max(0, this.timeLeft - 2);
    this.timerText.setText(String(this.timeLeft));
    this.timerText.setColor('#ff4444');
    this.time.delayedCall(400, () =>
      this.timerText.setColor(this.timeLeft <= 10 ? '#e74c3c' : '#f1c40f'));
    const t = this.add.text(W/2, 80, '-2s', {
      fontSize:'28px', fontFamily:'monospace', color:'#ff4444', stroke:'#000', strokeThickness:3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
    this.tweens.add({ targets:t, y:50, alpha:0, duration:600, onComplete:()=>t.destroy() });
  }

  _addCombo() {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.comboTimer) this.comboTimer.remove();
    this.comboTimer = this.time.delayedCall(1500, () => this._breakCombo());
    this._updateComboUI();
  }
  _breakCombo() {
    if (this.comboTimer) { this.comboTimer.remove(); this.comboTimer = null; }
    if (this.combo > 0) { this.combo = 0; this._updateComboUI(); }
  }
  _comboMult() {
    if (this.combo >= 8) return 4;
    if (this.combo >= 5) return 3;
    if (this.combo >= 3) return 2;
    return 1;
  }
  _updateComboUI() {
    if (this.combo >= 2) {
      this.comboText.setText(`${this.combo} HIT!  x${this._comboMult()}`).setAlpha(1);
      this.tweens.add({ targets:this.comboText, scaleX:1.2, scaleY:1.2, duration:80, yoyo:true });
    } else {
      this.tweens.add({ targets:this.comboText, alpha:0, duration:300 });
    }
  }

  _checkMoleHit() {
    const px = this.player.x;
    const pfeet = this.player.y + 26;
    for (const mole of this.moles) {
      if (mole.state !== 'visible') continue;
      if (Math.abs(pfeet - mole.holeY) > 80) continue;
      if (Math.abs(mole.x - px) > 110) continue;
      if (mole.hit()) {
        this.totalHit++;
        const mult = this._comboMult();
        const pts  = MOLE_SCORE[mole.floorIndex] * mult;
        this.score += pts;
        this.scoreText.setText(`Score: ${this.score}`);
        this._addCombo();
        this._popScore(mole.x, mole.holeY - 60, pts, mult);
        this.cameras.main.shake(90, 0.004 + mole.floorIndex * 0.003);
        return;
      }
    }
  }
  _popScore(x, y, pts, mult) {
    const color = mult>=4?'#ff6b6b':mult>=3?'#ff9f43':mult>=2?'#f1c40f':'#ffffff';
    const t = this.add.text(x, y, mult>1?`+${pts}  x${mult}`:`+${pts}`, {
      fontSize: mult>1?'26px':'22px', fontFamily:'monospace',
      color, stroke:'#000', strokeThickness:3,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets:t, y:y-55, alpha:0, duration:750, ease:'Quad.Out', onComplete:()=>t.destroy() });
  }

  _buildPlayer() {
    // Scale factor: 660x580 original → fit roughly 52px tall in scene
    const scale = (52 / 580) * 1.5;

    // Create animations from loaded frames
    const anims = this.anims;
    if (!anims.exists('idle')) {
      anims.create({ key: 'idle', frames: [
        { key: 'player_idle_0' }, { key: 'player_idle_1' },
        { key: 'player_idle_2' }, { key: 'player_idle_3' },
      ], frameRate: 6, repeat: -1 });
    }
    if (!anims.exists('run')) {
      anims.create({ key: 'run', frames: [
        { key: 'player_run_0' }, { key: 'player_run_1' },
        { key: 'player_run_2' }, { key: 'player_run_3' },
      ], frameRate: 10, repeat: -1 });
    }
    if (!anims.exists('attack')) {
      anims.create({ key: 'attack', frames: [
        { key: 'player_attack_0' }, { key: 'player_attack_1' },
        { key: 'player_attack_2' }, { key: 'player_attack_3' },
      ], frameRate: 12, repeat: 0 });
    }

    this.player = this.physics.add.sprite(100, FLOOR_Y[0] - 52, 'player_idle_0');
    this.player.setScale(scale);
    this.player.body.setSize(40 / scale, 52 / scale);
    this.player.setCollideWorldBounds(false);
    this.player.body.setGravityY(GRAVITY);
    this.player.setDepth(10);
    this.player.play('idle');
    this.physics.add.collider(this.player, this.platforms);
    this.player.jumpsLeft = 0;
    this.attackCooldown = false;
    this._wasOnGround = true;
    this._isAttacking = false;

    this.player.on('animationcomplete-attack', () => {
      this._isAttacking = false;
      this.player.play('idle');
    });
  }

  _setupInput() {
    this.keys = this.input.keyboard.addKeys({
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this.input.keyboard.on('keydown-UP',    () => this._tryJump());
    this.input.keyboard.on('keydown-W',     () => this._tryJump());
    this.input.keyboard.on('keydown-Z',     () => this._tryJump());
    this.input.keyboard.on('keydown-SPACE', () => this._tryAttack());
    this.input.keyboard.on('keydown-X',     () => this._tryAttack());
  }

  _tryJump() {
    if (this.player.body.blocked.down) {
      this.player.jumpsLeft = 1;
      this.player.setVelocityY(JUMP_VEL);
      this._spawnDust(this.player.x, this.player.y+24, 12);
    } else if (this.player.jumpsLeft > 0) {
      this.player.jumpsLeft--;
      this.player.setVelocityY(JUMP_VEL * 0.85);
    }
  }
  _tryAttack() {
    if (this.attackCooldown) return;
    this.attackCooldown = true;
    this._isAttacking = true;
    this.player.play('attack', true);
    if (this.player.body.blocked.down) this.player.setVelocityY(-180);
    this._checkMoleHit();
    this.time.delayedCall(320, () => { this.attackCooldown = false; });
  }
  _spawnDust(x, y, r) {
    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics();
      const ox = (Math.random() - 0.5) * r * 2;
      g.fillStyle(0xddddcc, 0.55);
      g.fillCircle(0, 0, r * 0.5 + Math.random() * r * 0.4);
      g.setPosition(x + ox, y).setDepth(5);
      this.tweens.add({
        targets: g,
        x: x + ox * 1.6,
        y: y - 6,
        alpha: 0,
        scaleX: 1.8, scaleY: 0.5,
        duration: 280 + Math.random() * 80,
        ease: 'Quad.Out',
        onComplete: () => g.destroy(),
      });
    }
  }

  _buildUI() {
    this.uiContainer = this.add.container(0,0).setScrollFactor(0).setDepth(100);
    const tb = this.add.graphics();
    tb.fillStyle(0x000000,0.5); tb.fillRoundedRect(W/2-70,10,140,44,8);
    this.uiContainer.add(tb);
    this.timerText = this.add.text(W/2,32,'120',{
      fontSize:'28px',fontFamily:'monospace',color:'#f1c40f',stroke:'#000',strokeThickness:3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    const sb = this.add.graphics();
    sb.fillStyle(0x000000,0.5); sb.fillRoundedRect(10,10,160,44,8);
    this.uiContainer.add(sb);
    this.scoreText = this.add.text(90,32,'Score: 0',{
      fontSize:'20px',fontFamily:'monospace',color:'#ffffff',stroke:'#000',strokeThickness:2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    this.comboText = this.add.text(W/2,90,'',{
      fontSize:'30px',fontFamily:'monospace',color:'#f1c40f',stroke:'#000',strokeThickness:4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102).setAlpha(0);

    this.floorText = this.add.text(W-20,32,'第 1 层',{
      fontSize:'16px',fontFamily:'monospace',color:'#7fdbff',stroke:'#000',strokeThickness:2,
    }).setOrigin(1,0.5).setScrollFactor(0).setDepth(101);

    this.diffText = this.add.text(W-20,56,'Lv.1',{
      fontSize:'14px',fontFamily:'monospace',color:'#aaaaaa',
    }).setOrigin(1,0.5).setScrollFactor(0).setDepth(101);

    this.add.text(W/2,H-18,'← → 移动    ↑ / W / Z 跳跃（二段跳）    空格 / X 攻击',{
      fontSize:'13px',fontFamily:'monospace',color:'#ffffff',
      stroke:'#000000',strokeThickness:4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    this.timeLeft = 120;
    this.time.addEvent({ delay:1000, repeat:119, callback:() => {
      this.timeLeft--;
      this.timerText.setText(String(this.timeLeft));
      if (this.timeLeft <= 10) this.timerText.setColor('#e74c3c');
      if (this.timeLeft <= 0)  this._onTimeUp();
      this._checkDifficulty();
    }});
  }

  _checkDifficulty() {
    const stage = Math.min(Math.floor((120 - this.timeLeft) / 30), DIFFICULTY.length - 1);
    if (stage !== this.diffStage) {
      this.diffStage = stage;
      this.currentDiff = DIFFICULTY[stage];
      this._scheduleSpawn();
      this.diffText.setText(`Lv.${stage+1}`).setColor('#f1c40f');
      this.tweens.add({ targets:this.diffText, scaleX:1.4, scaleY:1.4, duration:150, yoyo:true });
      this.time.delayedCall(600, () => this.diffText.setColor('#aaaaaa'));
    }
  }

  _onTimeUp() {
    this.physics.pause();
    if (this.comboTimer) this.comboTimer.remove();
    const hitRate = this.totalPopped > 0 ? Math.round(this.totalHit/this.totalPopped*100) : 0;
    const grade = hitRate>=90?'S':hitRate>=70?'A':hitRate>=50?'B':'C';
    const gc = {S:'#f1c40f',A:'#2ecc71',B:'#3498db',C:'#e74c3c'}[grade];

    const ov = this.add.graphics().setScrollFactor(0).setDepth(200);
    ov.fillStyle(0x000000,0.75); ov.fillRect(0,0,W,H);

    this.add.text(W/2,H/2-110,'时间到！',{
      fontSize:'48px',fontFamily:'monospace',color:'#f1c40f',stroke:'#000',strokeThickness:4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    this.add.text(W/2,H/2-40,grade,{
      fontSize:'72px',fontFamily:'monospace',color:gc,stroke:'#000',strokeThickness:5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    [`得分：${this.score}`,`最高连击：${this.maxCombo}`,`命中率：${hitRate}%  (${this.totalHit}/${this.totalPopped})`]
      .forEach((s,i) => this.add.text(W/2, H/2+55+i*34, s,{
        fontSize:'20px',fontFamily:'monospace',color:'#ffffff',stroke:'#000',strokeThickness:2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201));

    this.add.text(W/2,H/2+170,'按 R 重新开始',{
      fontSize:'16px',fontFamily:'monospace',color:'#aaaaaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    this.input.keyboard.once('keydown-R', () => this.scene.restart());
  }

  update() {
    const p = this.player, k = this.keys;
    const onGround = p.body.blocked.down;
    if (onGround) {
      p.jumpsLeft = 1;
      if (!this._wasOnGround) this._spawnDust(p.x, p.y+24, 14);
    }
    this._wasOnGround = onGround;

    const moving = k.left.isDown || k.right.isDown;
    if (k.left.isDown)       { p.setVelocityX(-PLAYER_SPEED); p.setFlipX(true); }
    else if (k.right.isDown) { p.setVelocityX(PLAYER_SPEED);  p.setFlipX(false); }
    else                     { p.setVelocityX(0); }

    // Update animation state
    if (!this._isAttacking) {
      if (moving) {
        if (p.anims.currentAnim?.key !== 'run') p.play('run', true);
      } else {
        if (p.anims.currentAnim?.key !== 'idle') p.play('idle', true);
      }
    }

    this.floorText.setText(`第 ${this._currentFloor()} 层`);
    if (p.y > H+100) { p.setPosition(100, FLOOR_Y[0]-52); p.setVelocity(0,0); }
  }

  _currentFloor() {
    const y = this.player.y;
    if (y > FLOOR_Y[1]+40) return 1;
    if (y > FLOOR_Y[2]+40) return 2;
    return 3;
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
new Phaser.Game({
  type: Phaser.AUTO, width: W, height: H,
  backgroundColor: '#1a1a2e',
  physics: { default:'arcade', arcade:{ gravity:{y:0}, debug:false } },
  scene: [MenuScene, GameScene],
});
