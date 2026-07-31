-- Up Migration
create table probe (id integer primary key);

-- Down Migration
drop table probe;
