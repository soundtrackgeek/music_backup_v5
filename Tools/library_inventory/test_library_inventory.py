import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('library_inventory.py'))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class InventoryTests(unittest.TestCase):
    def test_bidirectional_inventory_and_unavailable_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / 'music'
            root.mkdir()
            (root / 'owned.mp3').write_bytes(b'audio')
            (root / 'extra.flac').write_bytes(b'extra')
            (root / 'cover.jpg').write_bytes(b'cover')
            database = base / 'source.sqlite3'
            with sqlite3.connect(database) as connection:
                connection.executescript('CREATE TABLE tracks(id INTEGER,file_path TEXT,filename TEXT); CREATE TABLE import_runs(id INTEGER,status TEXT); INSERT INTO import_runs VALUES(1,"completed");')
                connection.executemany('INSERT INTO tracks VALUES(?,?,?)', [(1,str(root),'owned.mp3'), (2,str(root),'missing.mp3'), (3,str(root),'owned.mp3')])
            connection.close()
            before = database.read_bytes()
            result = inventory.run(database, [str(root), str(base/'offline')], base/'report', 0)
            self.assertEqual(result['findings']['catalog_not_observed'], 1)
            self.assertEqual(result['findings']['uncataloged_audio'], 1)
            self.assertEqual(result['findings']['duplicate_catalog_paths'], 1)
            self.assertEqual(result['roots'][0]['files'], 3)
            self.assertFalse(result['roots'][1]['complete'])
            self.assertEqual(database.read_bytes(), before)
            self.assertEqual((root/'owned.mp3').read_bytes(), b'audio')

    def test_windows_path_boundaries(self):
        self.assertEqual(inventory.key(r'\\?\D:\MUSIC\A.mp3'), inventory.key('d:/music/a.mp3'))
        self.assertFalse(inventory.within(inventory.key('D:/MUSIC2/a.mp3'), inventory.key('D:/MUSIC')))

    def test_reject_output_inside_media_before_creating_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / 'report'
            with self.assertRaises(ValueError):
                inventory.run(root/'unused.sqlite3', [str(root)], output, 0)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
