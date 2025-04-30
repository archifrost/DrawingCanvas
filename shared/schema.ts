import { pgTable, text, serial, integer, boolean, json, timestamp, pgEnum, numeric, uniqueIndex, foreignKey, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// User table for authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Enum for shape types - REMOVED as it was drawing specific
// export const shapeTypeEnum = pgEnum("shape_type", ["point", "line", "rectangle", "circle", "text"]);

// Drawing table REMOVED
// export const drawings = ... (removed)

// Setup relations for drawings REMOVED
// export const drawingsRelations = ... (removed)

// Shapes table REMOVED
// export const shapes = ... (removed)

// Setup relations for shapes REMOVED
// export const shapesRelations = ... (removed)

// Schema definitions for insert operations
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Insert schemas for drawings and shapes REMOVED

// Project Analysis Table
export const projectAnalyses = pgTable("project_analyses", {
  id: serial("id").primaryKey(),
  city: text("city"),
  district: text("district"),
  neighborhood: text("neighborhood"),
  block: text("block"),
  parcel: text("parcel"),
  land_area: numeric("land_area"),
  owner: text("owner"),
  sheet_no: text("sheet_no"),
  floor_count: text("floor_count"),
  front_setback: numeric("front_setback"),
  side_setback: numeric("side_setback"),
  rear_setback: numeric("rear_setback"),
  roof_type: text("roof_type"),
  roof_angle: numeric("roof_angle"),
  building_order: text("building_order"),
  plan_position: text("plan_position"),
  ground_coverage_ratio: numeric("ground_coverage_ratio"),
  floor_area_ratio: numeric("floor_area_ratio"),
  parcel_coordinates: json("parcel_coordinates").notNull().default('[]'), // JSON array of coordinates
  // drawingId: integer("drawing_id").references(() => drawings.id), // REMOVED
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Setup relations for projectAnalyses to users and drawings (many-to-one)
export const projectAnalysesRelations = relations(projectAnalyses, ({ one }) => ({
  user: one(users, {
    fields: [projectAnalyses.userId],
    references: [users.id],
  }),
  // drawing: one(drawings, {
  //   fields: [projectAnalyses.drawingId],
  //   references: [drawings.id],
  // }), // REMOVED
}));

// Insert Schema for projectAnalyses
export const insertProjectAnalysisSchema = createInsertSchema(projectAnalyses).omit({
  id: true,
  createdAt: true
});

// Type definitions
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Type definitions for drawings and shapes REMOVED

// Feedback tablosu
export const feedbacks = pgTable("feedbacks", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Feedback ilişkileri
export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  user: one(users, {
    fields: [feedbacks.userId],
    references: [users.id],
  }),
}));

// Insert Schema for feedbacks
export const insertFeedbackSchema = createInsertSchema(feedbacks).omit({
  id: true,
  createdAt: true
});

export type InsertProjectAnalysis = z.infer<typeof insertProjectAnalysisSchema>;
export type ProjectAnalysis = typeof projectAnalyses.$inferSelect;

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbacks.$inferSelect;
