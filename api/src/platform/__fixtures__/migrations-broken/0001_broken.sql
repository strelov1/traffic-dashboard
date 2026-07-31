-- Up Migration
create table broken (id integer primary key, ref integer references nonexistent_table (id));

-- Down Migration
drop table broken;
