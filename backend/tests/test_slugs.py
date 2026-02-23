"""
Tests for slug generation and collision handling.
"""
import pytest
import sys
sys.path.insert(0, '/app/backend')

from utils.helpers import generate_slug, normalize_text, generate_unique_slug


class TestNormalizeText:
    """Tests for text normalization (accent removal)"""
    
    def test_removes_accents(self):
        assert normalize_text("México") == "mexico"
        assert normalize_text("Café") == "cafe"
        assert normalize_text("Jalapeño") == "jalapeno"
        assert normalize_text("Résumé") == "resume"
    
    def test_handles_spanish_n(self):
        assert normalize_text("Uñas") == "unas"
        assert normalize_text("España") == "espana"
        assert normalize_text("Niño") == "nino"
    
    def test_lowercase(self):
        assert normalize_text("GUADALAJARA") == "guadalajara"
        assert normalize_text("Ciudad de México") == "ciudad de mexico"
    
    def test_preserves_numbers(self):
        assert normalize_text("Salón 2024") == "salon 2024"


class TestGenerateSlug:
    """Tests for slug generation"""
    
    def test_basic_slug(self):
        assert generate_slug("Test Spa") == "test-spa"
        assert generate_slug("Beauty Salon") == "beauty-salon"
    
    def test_removes_special_chars(self):
        assert generate_slug("Test & Spa!") == "test-spa"
        assert generate_slug("Café @ Night") == "cafe-night"
    
    def test_handles_accents(self):
        assert generate_slug("Salón de Uñas María") == "salon-de-unas-maria"
        assert generate_slug("México City") == "mexico-city"
        assert generate_slug("São Paulo") == "sao-paulo"
    
    def test_handles_multiple_spaces(self):
        assert generate_slug("Test    Spa") == "test-spa"
        assert generate_slug("  Leading Trailing  ") == "leading-trailing"
    
    def test_handles_multiple_hyphens(self):
        assert generate_slug("Test--Spa") == "test-spa"
        assert generate_slug("Test - Spa") == "test-spa"


class TestGenerateUniqueSlug:
    """Tests for unique slug generation with collision handling"""
    
    def test_no_collision(self):
        existing = ["other-spa", "another-spa"]
        assert generate_unique_slug("Test Spa", existing) == "test-spa"
    
    def test_single_collision(self):
        existing = ["test-spa"]
        assert generate_unique_slug("Test Spa", existing) == "test-spa-2"
    
    def test_multiple_collisions(self):
        existing = ["test-spa", "test-spa-2", "test-spa-3"]
        assert generate_unique_slug("Test Spa", existing) == "test-spa-4"
    
    def test_collision_with_gap(self):
        # If test-spa-2 doesn't exist but test-spa does, use test-spa-2
        existing = ["test-spa", "test-spa-3"]
        assert generate_unique_slug("Test Spa", existing) == "test-spa-2"
    
    def test_empty_existing(self):
        assert generate_unique_slug("Test Spa", []) == "test-spa"
    
    def test_normalized_collision(self):
        # "Salón María" and "Salon Maria" should collide
        existing = ["salon-maria"]
        assert generate_unique_slug("Salón María", existing) == "salon-maria-2"


class TestSlugCollisionScenarios:
    """Real-world collision scenarios"""
    
    def test_city_collision(self):
        """Multiple businesses with same name in same city"""
        existing = ["spa-relax", "spa-relax-2"]
        assert generate_unique_slug("Spa Relax", existing) == "spa-relax-3"
    
    def test_accent_collision(self):
        """Businesses with accented vs non-accented names"""
        existing = ["salon-de-belleza"]
        # Both should normalize to same slug
        assert generate_unique_slug("Salón de Belleza", existing) == "salon-de-belleza-2"
        assert generate_unique_slug("Salon de Belleza", existing) == "salon-de-belleza-2"
    
    def test_category_collision(self):
        """Categories with similar names"""
        existing = ["belleza-y-estetica"]
        assert generate_unique_slug("Belleza y Estética", existing) == "belleza-y-estetica-2"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
