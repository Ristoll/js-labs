/**
 * 2D Vector mathematics with pure, immutable methods.
 * Every operation returns a new Vector2 instance.
 */
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Adds vector v to this vector, returning a new Vector2.
   * @param {Vector2} v
   * @returns {Vector2}
   */
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  /**
   * Subtracts vector v from this vector, returning a new Vector2.
   * @param {Vector2} v
   * @returns {Vector2}
   */
  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  /**
   * Multiplies this vector by scalar s, returning a new Vector2.
   * @param {number} s
   * @returns {Vector2}
   */
  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }

  /**
   * Computes the Euclidean length (magnitude) of the vector.
   * @returns {number}
   */
  length() {
    return Math.hypot(this.x, this.y);
  }

  /**
   * Returns a normalized unit vector with magnitude 1.
   * If length is 0, returns a zero vector.
   * @returns {Vector2}
   */
  normalize() {
    const len = this.length();
    return len > 0 ? this.scale(1 / len) : new Vector2(0, 0);
  }

  /**
   * Rotates this vector by angle radians, returning a new Vector2.
   * @param {number} angle
   * @returns {Vector2}
   */
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  /**
   * Computes the dot product between this vector and vector v.
   * @param {Vector2} v
   * @returns {number}
   */
  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * Computes Euclidean distance to another vector.
   * @param {Vector2} v
   * @returns {number}
   */
  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  /**
   * Creates a deep copy of this vector.
   * @returns {Vector2}
   */
  clone() {
    return new Vector2(this.x, this.y);
  }

  /**
   * Creates a vector from heading angle (radians) and optional length.
   * Angle 0 points along +X axis.
   * @param {number} angle
   * @param {number} length
   * @returns {Vector2}
   */
  static fromAngle(angle, length = 1) {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  /**
   * Creates a new zero vector (0, 0).
   * @returns {Vector2}
   */
  static zero() {
    return new Vector2(0, 0);
  }
}
