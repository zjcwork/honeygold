ALTER TABLE events ADD COLUMN notices TEXT NOT NULL DEFAULT '';
UPDATE events SET notices='每位嘉宾每场活动仅可预约一种体验。
满额可加入候补，释放名额后按报名顺序递补。
请提前 8 小时以上修改或取消预约，提前 15 分钟到场。活动预约免费。';
