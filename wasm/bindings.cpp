// RocketSim for the browser: an arena with no stadium (THE_VOID), the static
// shapes the court is built from, and whole car and ball states in and out.
// State field names follow the RocketSim Python bindings, so a parity fixture
// recorded in Python can be passed straight in.

#include <array>
#include <set>
#include <vector>

#include <emscripten/bind.h>

#include "RocketSim.h"

using namespace emscripten;
using namespace RocketSim;

struct BallHitInfoJS {
	bool is_valid;
	Vec relative_pos_on_ball, ball_pos, extra_hit_vel;
	// uint64 in RocketSim, where ~0 means never; -1 here, and a double holds
	// any tick count a match reaches.
	double tick_count_when_hit, tick_count_when_extra_impulse_applied;
};

struct CarControlsJS {
	float throttle, steer, pitch, yaw, roll;
	bool jump, boost, handbrake;
};

// Every CarState field the Python bindings expose. The two they don't
// (isBoosting, timeSinceBoosted) keep their defaults on both sides.
struct CarStateJS {
	Vec pos, vel, ang_vel;
	std::array<Vec, 3> rot_mat;  // forward, right, up
	bool is_on_ground;
	std::array<bool, 4> wheels_with_contact;
	bool has_jumped, has_double_jumped, has_flipped;
	Vec flip_rel_torque;
	float jump_time, flip_time;
	bool is_flipping, is_jumping;
	float air_time, air_time_since_jump, boost, boosting_time;
	bool is_supersonic;
	float supersonic_time, handbrake_val;
	bool is_auto_flipping;
	float auto_flip_timer, auto_flip_torque_scale;
	bool has_world_contact;
	Vec world_contact_normal;
	uint32_t car_contact_id;
	float car_contact_cooldown_timer;
	bool is_demoed;
	float demo_respawn_timer;
	BallHitInfoJS ball_hit_info;
	CarControlsJS last_controls;
};

struct BallStateJS {
	Vec pos, vel, ang_vel;
	std::array<Vec, 3> rot_mat;
	uint32_t last_hit_car_id;
};

struct MutatorsJS {
	Vec gravity;
	float boost_used_per_second;
};

static CarControls toControls(const CarControlsJS& c) {
	CarControls out;
	out.throttle = c.throttle; out.steer = c.steer;
	out.pitch = c.pitch; out.yaw = c.yaw; out.roll = c.roll;
	out.jump = c.jump; out.boost = c.boost; out.handbrake = c.handbrake;
	return out;
}

static CarControlsJS fromControls(const CarControls& c) {
	return { c.throttle, c.steer, c.pitch, c.yaw, c.roll, c.jump, c.boost, c.handbrake };
}

static double fromTick(uint64_t t) { return t == ~0ULL ? -1 : (double)t; }
static uint64_t toTick(double t) { return t < 0 ? ~0ULL : (uint64_t)t; }

static std::array<Vec, 3> fromRotMat(const RotMat& m) { return { m.forward, m.right, m.up }; }
static RotMat toRotMat(const std::array<Vec, 3>& m) { return RotMat(m[0], m[1], m[2]); }

static CarStateJS fromCarState(const CarState& s) {
	CarStateJS o;
	o.pos = s.pos; o.vel = s.vel; o.ang_vel = s.angVel; o.rot_mat = fromRotMat(s.rotMat);
	o.is_on_ground = s.isOnGround;
	for (int i = 0; i < 4; i++) o.wheels_with_contact[i] = s.wheelsWithContact[i];
	o.has_jumped = s.hasJumped; o.has_double_jumped = s.hasDoubleJumped; o.has_flipped = s.hasFlipped;
	o.flip_rel_torque = s.flipRelTorque;
	o.jump_time = s.jumpTime; o.flip_time = s.flipTime;
	o.is_flipping = s.isFlipping; o.is_jumping = s.isJumping;
	o.air_time = s.airTime; o.air_time_since_jump = s.airTimeSinceJump;
	o.boost = s.boost; o.boosting_time = s.boostingTime;
	o.is_supersonic = s.isSupersonic; o.supersonic_time = s.supersonicTime;
	o.handbrake_val = s.handbrakeVal;
	o.is_auto_flipping = s.isAutoFlipping; o.auto_flip_timer = s.autoFlipTimer; o.auto_flip_torque_scale = s.autoFlipTorqueScale;
	o.has_world_contact = s.worldContact.hasContact; o.world_contact_normal = s.worldContact.contactNormal;
	o.car_contact_id = s.carContact.otherCarID; o.car_contact_cooldown_timer = s.carContact.cooldownTimer;
	o.is_demoed = s.isDemoed; o.demo_respawn_timer = s.demoRespawnTimer;
	const BallHitInfo& h = s.ballHitInfo;
	o.ball_hit_info = { h.isValid, h.relativePosOnBall, h.ballPos, h.extraHitVel,
		fromTick(h.tickCountWhenHit), fromTick(h.tickCountWhenExtraImpulseApplied) };
	o.last_controls = fromControls(s.lastControls);
	return o;
}

static CarState toCarState(const CarStateJS& o) {
	CarState s;
	s.pos = o.pos; s.vel = o.vel; s.angVel = o.ang_vel; s.rotMat = toRotMat(o.rot_mat);
	s.isOnGround = o.is_on_ground;
	for (int i = 0; i < 4; i++) s.wheelsWithContact[i] = o.wheels_with_contact[i];
	s.hasJumped = o.has_jumped; s.hasDoubleJumped = o.has_double_jumped; s.hasFlipped = o.has_flipped;
	s.flipRelTorque = o.flip_rel_torque;
	s.jumpTime = o.jump_time; s.flipTime = o.flip_time;
	s.isFlipping = o.is_flipping; s.isJumping = o.is_jumping;
	s.airTime = o.air_time; s.airTimeSinceJump = o.air_time_since_jump;
	s.boost = o.boost; s.boostingTime = o.boosting_time;
	s.isSupersonic = o.is_supersonic; s.supersonicTime = o.supersonic_time;
	s.handbrakeVal = o.handbrake_val;
	s.isAutoFlipping = o.is_auto_flipping; s.autoFlipTimer = o.auto_flip_timer; s.autoFlipTorqueScale = o.auto_flip_torque_scale;
	s.worldContact.hasContact = o.has_world_contact; s.worldContact.contactNormal = o.world_contact_normal;
	s.carContact.otherCarID = o.car_contact_id; s.carContact.cooldownTimer = o.car_contact_cooldown_timer;
	s.isDemoed = o.is_demoed; s.demoRespawnTimer = o.demo_respawn_timer;
	const BallHitInfoJS& h = o.ball_hit_info;
	s.ballHitInfo.isValid = h.is_valid;
	s.ballHitInfo.relativePosOnBall = h.relative_pos_on_ball;
	s.ballHitInfo.ballPos = h.ball_pos;
	s.ballHitInfo.extraHitVel = h.extra_hit_vel;
	s.ballHitInfo.tickCountWhenHit = toTick(h.tick_count_when_hit);
	s.ballHitInfo.tickCountWhenExtraImpulseApplied = toTick(h.tick_count_when_extra_impulse_applied);
	s.lastControls = toControls(o.last_controls);
	return s;
}

class Sim {
public:
	explicit Sim(float tickRate) {
		static bool initialized = false;
		if (!initialized) {
			RocketSim::InitFromMem({}, true);
			initialized = true;
		}
		arena = Arena::Create(GameMode::THE_VOID, {}, tickRate);
		arena->SetBallTouchCallback(&Sim::onBallTouch, this);
	}
	~Sim() { delete arena; }

	void addStaticPlane(Vec pos, Vec normal) { arena->AddStaticPlane(pos, normal); }

	void addStaticMesh(const std::vector<Vec>& vertices, const std::vector<int>& triangles) {
		arena->AddStaticMesh(vertices, triangles);
	}

	uint32_t addCar(int team) { return arena->AddCar((Team)team)->id; }

	MutatorsJS getMutators() {
		const MutatorConfig& m = arena->GetMutatorConfig();
		return { m.gravity, m.boostUsedPerSecond };
	}

	void setMutators(const MutatorsJS& js) {
		MutatorConfig m = arena->GetMutatorConfig();
		m.gravity = js.gravity;
		m.boostUsedPerSecond = js.boost_used_per_second;
		arena->SetMutatorConfig(m);
	}

	CarStateJS getCarState(uint32_t id) { return fromCarState(car(id)->GetState()); }
	void setCarState(uint32_t id, const CarStateJS& s) { car(id)->SetState(toCarState(s)); }
	void setCarControls(uint32_t id, const CarControlsJS& c) { car(id)->controls = toControls(c); }

	BallStateJS getBallState() const {
		BallState s = arena->ball->GetState();
		return { s.pos, s.vel, s.angVel, fromRotMat(s.rotMat), s.lastHitCarID };
	}

	void setBallState(const BallStateJS& js) {
		BallState s;
		s.pos = js.pos; s.vel = js.vel; s.angVel = js.ang_vel; s.rotMat = toRotMat(js.rot_mat);
		s.lastHitCarID = js.last_hit_car_id;
		arena->ball->SetState(s);
	}

	/** A fresh car state at rest, keeping only position, rotation and boost: how the court respawns a car. */
	void resetCar(uint32_t id, Vec pos, const std::array<Vec, 3>& rotMat, float boost) {
		CarState s;
		s.pos = pos;
		s.rotMat = toRotMat(rotMat);
		s.boost = boost;
		car(id)->SetState(s);
	}

	void step(int ticks) {
		touched.clear();
		arena->Step(ticks);
	}

	/** The cars that touched the ball during the last step(), by id. */
	std::vector<uint32_t> touchedCarIds() const { return std::vector<uint32_t>(touched.begin(), touched.end()); }

private:
	Arena* arena;
	std::set<uint32_t> touched;

	static void onBallTouch(Arena*, Car* car, void* self) { static_cast<Sim*>(self)->touched.insert(car->id); }

	Car* car(uint32_t id) {
		Car* c = arena->GetCar(id);
		if (!c) throw std::runtime_error("No car with that id");
		return c;
	}
};

EMSCRIPTEN_BINDINGS(rocketsim) {
	value_array<Vec>("Vec").element(&Vec::x).element(&Vec::y).element(&Vec::z);
	value_array<std::array<Vec, 3>>("RotMat").element(emscripten::index<0>()).element(emscripten::index<1>()).element(emscripten::index<2>());
	value_array<std::array<bool, 4>>("Wheels").element(emscripten::index<0>()).element(emscripten::index<1>()).element(emscripten::index<2>()).element(emscripten::index<3>());
	register_vector<Vec>("VecList");
	register_vector<int>("IntList");
	register_vector<uint32_t>("IdList");

	value_object<CarControlsJS>("CarControls")
		.field("throttle", &CarControlsJS::throttle).field("steer", &CarControlsJS::steer)
		.field("pitch", &CarControlsJS::pitch).field("yaw", &CarControlsJS::yaw).field("roll", &CarControlsJS::roll)
		.field("jump", &CarControlsJS::jump).field("boost", &CarControlsJS::boost).field("handbrake", &CarControlsJS::handbrake);

	value_object<BallHitInfoJS>("BallHitInfo")
		.field("is_valid", &BallHitInfoJS::is_valid)
		.field("relative_pos_on_ball", &BallHitInfoJS::relative_pos_on_ball)
		.field("ball_pos", &BallHitInfoJS::ball_pos)
		.field("extra_hit_vel", &BallHitInfoJS::extra_hit_vel)
		.field("tick_count_when_hit", &BallHitInfoJS::tick_count_when_hit)
		.field("tick_count_when_extra_impulse_applied", &BallHitInfoJS::tick_count_when_extra_impulse_applied);

	value_object<CarStateJS>("CarState")
		.field("pos", &CarStateJS::pos).field("vel", &CarStateJS::vel).field("ang_vel", &CarStateJS::ang_vel)
		.field("rot_mat", &CarStateJS::rot_mat)
		.field("is_on_ground", &CarStateJS::is_on_ground)
		.field("wheels_with_contact", &CarStateJS::wheels_with_contact)
		.field("has_jumped", &CarStateJS::has_jumped).field("has_double_jumped", &CarStateJS::has_double_jumped)
		.field("has_flipped", &CarStateJS::has_flipped).field("flip_rel_torque", &CarStateJS::flip_rel_torque)
		.field("jump_time", &CarStateJS::jump_time).field("flip_time", &CarStateJS::flip_time)
		.field("is_flipping", &CarStateJS::is_flipping).field("is_jumping", &CarStateJS::is_jumping)
		.field("air_time", &CarStateJS::air_time).field("air_time_since_jump", &CarStateJS::air_time_since_jump)
		.field("boost", &CarStateJS::boost).field("boosting_time", &CarStateJS::boosting_time)
		.field("is_supersonic", &CarStateJS::is_supersonic).field("supersonic_time", &CarStateJS::supersonic_time)
		.field("handbrake_val", &CarStateJS::handbrake_val)
		.field("is_auto_flipping", &CarStateJS::is_auto_flipping).field("auto_flip_timer", &CarStateJS::auto_flip_timer)
		.field("auto_flip_torque_scale", &CarStateJS::auto_flip_torque_scale)
		.field("has_world_contact", &CarStateJS::has_world_contact).field("world_contact_normal", &CarStateJS::world_contact_normal)
		.field("car_contact_id", &CarStateJS::car_contact_id).field("car_contact_cooldown_timer", &CarStateJS::car_contact_cooldown_timer)
		.field("is_demoed", &CarStateJS::is_demoed).field("demo_respawn_timer", &CarStateJS::demo_respawn_timer)
		.field("ball_hit_info", &CarStateJS::ball_hit_info)
		.field("last_controls", &CarStateJS::last_controls);

	value_object<BallStateJS>("BallState")
		.field("pos", &BallStateJS::pos).field("vel", &BallStateJS::vel).field("ang_vel", &BallStateJS::ang_vel)
		.field("rot_mat", &BallStateJS::rot_mat).field("last_hit_car_id", &BallStateJS::last_hit_car_id);

	value_object<MutatorsJS>("Mutators")
		.field("gravity", &MutatorsJS::gravity).field("boost_used_per_second", &MutatorsJS::boost_used_per_second);

	class_<Sim>("Sim")
		.constructor<float>()
		.function("addStaticPlane", &Sim::addStaticPlane)
		.function("addStaticMesh", &Sim::addStaticMesh)
		.function("addCar", &Sim::addCar)
		.function("getMutators", &Sim::getMutators)
		.function("setMutators", &Sim::setMutators)
		.function("getCarState", &Sim::getCarState)
		.function("setCarState", &Sim::setCarState)
		.function("setCarControls", &Sim::setCarControls)
		.function("getBallState", &Sim::getBallState)
		.function("setBallState", &Sim::setBallState)
		.function("resetCar", &Sim::resetCar)
		.function("step", &Sim::step)
		.function("touchedCarIds", &Sim::touchedCarIds);
}
